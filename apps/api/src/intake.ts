import { Injectable,Inject } from '@nestjs/common';
import { randomBytes,createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Manifest,manifestSchema,collectionSchema,limits } from '@workbench/core';
import { Db,Context,audit,enqueue,shopWhere } from './db';
import { admin,assertShop,tokenHash,AuthRequest } from './auth';
import { Storage } from './storage';
import { fail } from './errors';
const json=(v:any)=>JSON.parse(JSON.stringify(v));
@Injectable()
export class Intake {
  constructor(@Inject(Db) private db:Db,@Inject(Storage) private storage:Storage){}
  async createCollection(ctx:Context,body:unknown){
    if(ctx.role==='viewer')fail('FORBIDDEN','没有采集任务创建权限',403);
    const data=collectionSchema.parse(body);assertShop(ctx,data.shopId);
    if(data.periodStart&&data.periodEnd&&Date.parse(data.periodStart)>=Date.parse(data.periodEnd))fail('PERIOD','时间范围无效');
    return this.db.tenant(ctx,async tx=>{
      const shop=await tx.shop.findFirst({where:{id:data.shopId,enterpriseId:ctx.enterpriseId}});if(!shop)fail('SHOP','店铺不存在',404);
      const task=await tx.collectionRequest.create({data:{...data,enterpriseId:ctx.enterpriseId,createdBy:ctx.userId}});
      await audit(tx,ctx,'collection.create',task.id,{},task.shopId);return task;
    });
  }
  async issueGrant(ctx:Context,id:string){
    admin(ctx);const secret=randomBytes(32).toString('base64url');
    return this.db.tenant(ctx,async tx=>{
      const task=await tx.collectionRequest.findFirst({where:{id,enterpriseId:ctx.enterpriseId,...shopWhere(ctx)}});if(!task)fail('TASK','采集任务不存在',404);
      const grant=await tx.uploadGrant.create({data:{enterpriseId:ctx.enterpriseId,shopId:task.shopId,collectionRequestId:id,tokenHash:tokenHash(secret),expiresAt:new Date(Date.now()+3600000)}});
      await audit(tx,ctx,'grant.issue',grant.id,{},task.shopId);return {id:grant.id,token:secret,expiresAt:grant.expiresAt,task};
    });
  }
  async revoke(ctx:Context,id:string){admin(ctx);return this.db.tenant(ctx,async tx=>{const g=await tx.uploadGrant.findFirst({where:{id,enterpriseId:ctx.enterpriseId}});if(!g)fail('GRANT','凭据不存在',404);await tx.uploadGrant.update({where:{id},data:{revokedAt:new Date()}});await audit(tx,ctx,'grant.revoke',id,{},g.shopId);return {ok:true};});}
  async createSession(req:AuthRequest,body:unknown){
    const manifest=manifestSchema.parse(body);if(manifest.collection_request_id!==req.grant!.collectionRequestId)fail('TASK','清单不属于此采集任务',403);
    return this.db.tenant(req.ctx,async tx=>{
      const task=await tx.collectionRequest.findFirst({where:{id:manifest.collection_request_id,enterpriseId:req.ctx.enterpriseId}});if(!task)fail('TASK','采集任务不存在',404);
      const shop=await tx.shop.findUnique({where:{id:task.shopId}});const enterprise=await tx.enterprise.findUnique({where:{id:req.ctx.enterpriseId}});
      if(shop?.platform!==manifest.source_platform)fail('PLATFORM','清单平台与任务店铺不一致');
      for(const f of manifest.files){
        if(!task.datasets.includes(f.dataset)||!task.allowedMethods.includes(f.acquisition_method))fail('TASK_SCOPE','文件的数据类型或采集方式不在任务范围');
        if(f.acquisition_method==='simulation'&&enterprise?.mode!=='demo')fail('DEMO_SCOPE','模拟数据仅允许进入演示企业');
        if(f.acquisition_method==='ai_report'&&f.dataset!=='knowledge')fail('AI_REPORT','AI 摘要只能导入参考知识资料');
        if(!/\.(csv|xlsx|json|jsonl|zip)$/i.test(f.filename))fail('FILE_TYPE','格式不支持；旧 XLS 与宏文件请先转换');
        if(task.periodStart&&(!f.period_start||Date.parse(f.period_start)<task.periodStart.getTime()))fail('PERIOD_SCOPE','文件开始时间超出任务范围或未声明');
        if(task.periodEnd&&(!f.period_end_exclusive||Date.parse(f.period_end_exclusive)>task.periodEnd.getTime()))fail('PERIOD_SCOPE','文件结束时间超出任务范围或未声明');
      }
      const batch=await tx.importBatch.create({data:{enterpriseId:req.ctx.enterpriseId,shopId:task.shopId,collectionRequestId:task.id,grantId:req.grant!.id,manifest:json(manifest),mapping:{},files:{create:manifest.files.map(f=>({enterpriseId:req.ctx.enterpriseId,shopId:task.shopId,filename:f.filename,dataset:f.dataset,sha256:f.sha256,size:f.size,spec:json(f)}))}},include:{files:true}});
      await audit(tx,req.ctx,'intake.create',batch.id,{},task.shopId);return {id:batch.id,state:batch.state,files:batch.files.map(f=>({id:f.id,filename:f.filename,uploaded:false}))};
    });
  }
  async status(req:AuthRequest,id:string){return this.db.tenant(req.ctx,async tx=>{const batch=await tx.importBatch.findFirst({where:{id,enterpriseId:req.ctx.enterpriseId,grantId:req.grant!.id},include:{files:true}});if(!batch)fail('SESSION','会话不存在',404);return {id:batch.id,state:batch.state,error:batch.error,files:batch.files.map(f=>({id:f.id,filename:f.filename,uploaded:!!f.uploadedAt})),summary:batch.summary};});}
  async upload(req:AuthRequest,id:string,fileId:string){
    const info=await this.db.tenant(req.ctx,async tx=>{
      const b=await tx.importBatch.findFirst({where:{id,grantId:req.grant!.id,enterpriseId:req.ctx.enterpriseId},include:{files:true}});
      if(!b||!['uploading','created'].includes(b.state))fail('STATE','会话不允许上传',409);
      const f=b.files.find(f=>f.id===fileId);if(!f)fail('FILE','文件不存在',404);return {b,f};
    });
    if(info.f.uploadedAt){req.resume();return {ok:true,duplicate:true};}
    const contentLength=Number(req.headers['content-length']);if(contentLength!==info.f.size)fail('SIZE','Content-Length 与清单大小不一致');
    const temp=await this.storage.temp();let size=0;const sha=createHash('sha256');
    const check=new Transform({transform(chunk,_,cb){size+=chunk.length;if(size>info.f.size||size>limits.file)return cb(Error('file too large'));sha.update(chunk);cb(null,chunk);}});
    try{
      await pipeline(req,check,createWriteStream(temp));
      if(size!==info.f.size||sha.digest('hex')!==info.f.sha256)fail('INTEGRITY','大小或 SHA-256 校验失败');
      const key=`${req.ctx.enterpriseId}/${info.b.shopId}/original/${info.f.id}`;
      await this.db.tenant(req.ctx,async tx=>{
        await tx.$queryRaw`SELECT id FROM "ImportBatch" WHERE id=${id}::uuid FOR UPDATE`;
        const b=await tx.importBatch.findUnique({where:{id}});if(b?.state!=='uploading')fail('STATE','会话状态已变化',409);
        const grant=await tx.uploadGrant.findUnique({where:{id:req.grant!.id}});if(!grant||grant.revokedAt||grant.expiresAt<new Date())fail('GRANT','凭据在上传期间已失效',401);
        const existing=await tx.importFile.findUnique({where:{id:fileId}});if(existing?.uploadedAt)return;
        await this.storage.put(key,temp);await tx.importFile.update({where:{id:fileId},data:{storageKey:key,uploadedAt:new Date()}});
      });return {ok:true};
    }finally{await unlink(temp).catch(()=>{});}
  }
  async complete(req:AuthRequest,id:string){return this.db.tenant(req.ctx,async tx=>{
    await tx.$queryRaw`SELECT id FROM "ImportBatch" WHERE id=${id}::uuid FOR UPDATE`;
    const b=await tx.importBatch.findFirst({where:{id,grantId:req.grant!.id,enterpriseId:req.ctx.enterpriseId},include:{files:true}});if(!b)fail('SESSION','会话不存在',404);
    if(!['created','uploading'].includes(b.state))return {id,state:b.state};
    if(b.files.some(f=>!f.uploadedAt))fail('INCOMPLETE','还有文件尚未上传');
    await tx.importBatch.update({where:{id},data:{state:'uploaded'}});await enqueue(tx,req.ctx,b.shopId,'parse',{batchId:id});await audit(tx,req.ctx,'intake.complete',id,{},b.shopId);return {id,state:'uploaded'};
  });}
}
