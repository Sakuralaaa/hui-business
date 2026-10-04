import { Inject,Injectable } from '@nestjs/common';
import { createCipheriv,createDecipheriv,randomBytes } from 'node:crypto';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { ModelProvider } from '@workbench/core';
import { Db,Context,audit } from './db';
import { admin } from './auth';
import { fail } from './errors';
const configSchema=z.object({provider:z.enum(['openai-compatible','ollama-compatible']),baseUrl:z.string().url(),model:z.string().min(1).max(100),apiKey:z.string().min(1).max(500).optional(),monthlyBudget:z.string(),inputPrice:z.string(),outputPrice:z.string(),maxTokens:z.number().int().min(256).max(8000),concurrency:z.number().int().min(1).max(8)});
function encryptionKey(){const key=process.env.ENCRYPTION_KEY;if(!key||!/^[a-f0-9]{64}$/i.test(key))throw Error('ENCRYPTION_KEY requires 64 hex characters');return Buffer.from(key,'hex');}
export function encrypt(text:string){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);const body=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return [iv.toString('hex'),body.toString('hex'),cipher.getAuthTag().toString('hex')].join(':');}
export function decrypt(value:string){const [iv,body,tag]=value.split(':');if(!iv||!body||!tag)throw Error('invalid encrypted key');const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'hex'));decipher.setAuthTag(Buffer.from(tag,'hex'));return Buffer.concat([decipher.update(Buffer.from(body,'hex')),decipher.final()]).toString('utf8');}
function allowedUrl(value:string){const url=new URL(value);const allowed=(process.env.MODEL_HOST_ALLOWLIST??'api.openai.com,api.deepseek.com,dashscope.aliyuncs.com').split(',');if(!allowed.includes(url.host)||url.username||url.password||url.search||url.hash)fail('MODEL_HOST','模型地址需由部署管理员加入 MODEL_HOST_ALLOWLIST');if(url.protocol!=='https:'&&!(process.env.ALLOW_LOCAL_MODEL_HTTP==='true'&&url.protocol==='http:'))fail('MODEL_HTTPS','模型接口需要 HTTPS');return url.toString().replace(/\/$/,'');}
export class CompatibleModel implements ModelProvider {
  name='openai-compatible';
  constructor(private baseUrl:string,private key:string){}
  async chat(input:{model:string;system:string;user:string;maxTokens:number}){
    const response=await fetch(`${allowedUrl(this.baseUrl)}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json'},body:JSON.stringify({model:input.model,messages:[{role:'system',content:input.system},{role:'user',content:input.user}],max_tokens:input.maxTokens,temperature:0.2}),redirect:'error',signal:AbortSignal.timeout(90000)});
    if(!response.ok)throw Error(`模型请求失败 HTTP ${response.status}`);
    const data=await response.json() as any;const text=data.choices?.[0]?.message?.content;if(typeof text!=='string')throw Error('模型返回格式不兼容');
    return {text,inputTokens:typeof data.usage?.prompt_tokens==='number'?data.usage.prompt_tokens:null,outputTokens:typeof data.usage?.completion_tokens==='number'?data.usage.completion_tokens:null};
  }
}
@Injectable()
export class Models {
  constructor(@Inject(Db) private db:Db){}
  async settings(ctx:Context){admin(ctx);return this.db.tenant(ctx,async tx=>{const c=await tx.modelConfig.findUnique({where:{enterpriseId:ctx.enterpriseId}});if(!c)return null;const {encryptedKey,...safe}=c;return {...safe,hasKey:!!encryptedKey};});}
  async save(ctx:Context,body:unknown){
    admin(ctx);const c=configSchema.parse(body);allowedUrl(c.baseUrl);for(const key of ['monthlyBudget','inputPrice','outputPrice'] as const)if(!new Decimal(c[key]).isFinite()||new Decimal(c[key]).lt(0))fail('MODEL_PRICE','预算与价格需要非负数');
    return this.db.tenant(ctx,async tx=>{const prev=await tx.modelConfig.findUnique({where:{enterpriseId:ctx.enterpriseId}});if(!c.apiKey&&!prev)fail('MODEL_KEY','首次配置需要模型密钥');const {apiKey,...data}=c;await tx.modelConfig.upsert({where:{enterpriseId:ctx.enterpriseId},create:{...data,enterpriseId:ctx.enterpriseId,encryptedKey:apiKey?encrypt(apiKey):prev!.encryptedKey},update:{...data,...(apiKey?{encryptedKey:encrypt(apiKey)}:{})}});await audit(tx,ctx,'model.configure',ctx.enterpriseId,{provider:c.provider,model:c.model});return {ok:true};});
  }
  async call(ctx:Context,shopId:string,runId:string,system:string,user:string){
    if(user.length>100000)fail('MODEL_INPUT','模型输入超过首版限制');
    const estimatedInput=Buffer.byteLength(system+user,'utf8')+512;
    const reservation=await this.db.tenant(ctx,async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.enterpriseId+':model-budget'},0))::text AS locked`;
      const c=await tx.modelConfig.findUnique({where:{enterpriseId:ctx.enterpriseId}});if(!c)return null;
      const month=new Date();month.setUTCDate(1);month.setUTCHours(0,0,0,0);
      const calls=await tx.modelCall.findMany({where:{enterpriseId:ctx.enterpriseId,createdAt:{gte:month}}});
      const active=calls.filter(x=>x.state==='running');if(active.length>=c.concurrency)fail('MODEL_CONCURRENCY','模型并发已满，请稍后重试',429);
      const reserved=new Decimal(estimatedInput).mul(c.inputPrice.toString()).plus(new Decimal(c.maxTokens).mul(c.outputPrice.toString())).div(1000000);
      const used=calls.reduce((s,x)=>s.plus(x.cost?.toString()??x.reservedCost.toString()),new Decimal(0));if(used.plus(reserved).gt(c.monthlyBudget.toString()))fail('MODEL_BUDGET','本月模型预算不足，请调整预算或减少任务',429);
      const call=await tx.modelCall.create({data:{enterpriseId:ctx.enterpriseId,shopId,runId,model:c.model,state:'running',reservedCost:reserved.toFixed(8)}});return {config:c,call};
    });
    if(!reservation)return null;
    const {config:c,call}=reservation;
    try{
      const output=await new CompatibleModel(c.baseUrl,decrypt(c.encryptedKey)).chat({model:c.model,system,user,maxTokens:c.maxTokens});
      const cost=new Decimal(output.inputTokens??estimatedInput).mul(c.inputPrice.toString()).plus(new Decimal(output.outputTokens??c.maxTokens).mul(c.outputPrice.toString())).div(1000000);
      await this.db.tenant(ctx,tx=>tx.modelCall.update({where:{id:call.id},data:{state:'completed',inputTokens:output.inputTokens,outputTokens:output.outputTokens,cost:cost.toFixed(8),costKind:'estimated'}}));return {text:output.text,model:c.model};
    }catch(e){await this.db.tenant(ctx,tx=>tx.modelCall.update({where:{id:call.id},data:{state:'failed_unknown_cost',error:e instanceof Error?e.message:'模型失败'}}));throw e;}
  }
}
