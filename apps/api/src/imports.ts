import { Injectable,Inject } from '@nestjs/common';
import { mkdir,rm } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { Prisma } from '@prisma/client';
import { Dataset,Manifest,Mapping,mappingSchema,suggestMapping,normalizeRow,classifyChange,hash,limits } from '@workbench/core';
import { Db,Context,audit,enqueue,shopWhere } from './db';
import { permission } from './auth';
import { Storage } from './storage';
import { parseFile,extractZip } from './parser';
import { fail } from './errors';
import { shopLock } from './business';
const json=(v:any):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(v));
const readable=(e:unknown)=>e instanceof Error?e.message:'解析失败';
@Injectable()
export class Imports {
  constructor(@Inject(Db) private db:Db,@Inject(Storage) private storage:Storage){}
  async parse(ctx:Context,batchId:string){
    const b=await this.db.tenant(ctx,async tx=>{const b=await tx.importBatch.findFirst({where:{id:batchId,enterpriseId:ctx.enterpriseId},include:{files:true}});if(!b)fail('BATCH','批次不存在',404);if(b.state==='completed')return b;await tx.importBatch.update({where:{id:batchId},data:{state:'validating',error:null}});return b;});if(b.state==='completed')return;
    try{
      let totalRows=0;const mappings:Record<string,Mapping>={};
      for(const f of b.files){
        if(!f.storageKey)throw Error('缺少已封存文件');
        const original=await this.storage.local(f.storageKey);const dir=join(dirname(original),`extract-${f.id}`);
        let paths=[original];if(f.filename.toLowerCase().endsWith('.zip'))paths=await extractZip(original,dir);
        await this.db.tenant(ctx,tx=>tx.stagingRow.deleteMany({where:{fileId:f.id,enterpriseId:ctx.enterpriseId}}));
        let rowNumber=0;let chunk:Prisma.StagingRowCreateManyInput[]=[];let headers:string[]=[];
        try{for(const path of paths){for await(const row of parseFile(path,path===original?f.filename:path)){
          if(++totalRows>limits.rows)throw Error('批次行数超过上限，请拆分');
          if(!headers.length)headers=Object.keys(row.raw);
          chunk.push({enterpriseId:ctx.enterpriseId,shopId:b.shopId,fileId:f.id,rowNumber:++rowNumber,raw:json(row.raw),errors:[]});
          if(chunk.length===1000){await this.db.tenant(ctx,tx=>tx.stagingRow.createMany({data:chunk}));chunk=[];}
        }}if(chunk.length)await this.db.tenant(ctx,tx=>tx.stagingRow.createMany({data:chunk}));
        }finally{if(paths[0]!==original)await rm(dir,{recursive:true,force:true});}
        mappings[f.id]=suggestMapping(headers,f.dataset as Dataset);
      }
      await this.db.tenant(ctx,tx=>tx.importBatch.update({where:{id:batchId},data:{mapping:json(mappings)}}));await this.previewBuild(ctx,batchId);
    }catch(e){await this.db.tenant(ctx,tx=>tx.importBatch.update({where:{id:batchId},data:{state:'rejected',error:readable(e)}}));throw e;}
  }
  async updateMapping(ctx:Context,batchId:string,body:{fileId:string;mapping:unknown}){
    const mapping=mappingSchema.parse(body.mapping);
    return this.db.tenant(ctx,async tx=>{
      await tx.$queryRaw`SELECT id FROM "ImportBatch" WHERE id=${batchId}::uuid FOR UPDATE`;
      const b=await tx.importBatch.findFirst({where:{id:batchId,enterpriseId:ctx.enterpriseId,...shopWhere(ctx)},include:{files:true}});if(!b)fail('BATCH','批次不存在',404);
      if(!['needs_mapping','needs_review','ready_for_confirmation','failed'].includes(b.state))fail('STATE','当前状态不允许修改映射',409);
      const f=b.files.find(f=>f.id===body.fileId);if(!f)fail('FILE','文件不存在',404);permission(ctx,f.dataset,true);
      const all={...(b.mapping as Record<string,unknown>),[f.id]:mapping};
      await tx.importBatch.update({where:{id:batchId},data:{mapping:json(all),state:'validating',previewHash:null,previewVersion:{increment:1}}});
      await enqueue(tx,ctx,b.shopId,'preview',{batchId});await audit(tx,ctx,'import.mapping',batchId,{fileId:f.id},b.shopId);return {state:'validating'};
    });
  }
  async previewBuild(ctx:Context,batchId:string){
    const batch=await this.db.tenant(ctx,tx=>tx.importBatch.findUnique({where:{id:batchId},include:{files:true}}));if(!batch||batch.state==='completed')return;
    const manifest=batch.manifest as unknown as Manifest;const summary:Record<string,any>={new:0,update:0,duplicate:0,stale:0,conflict:0,error:0,excluded:0,batch_duplicate:0,batch_conflict:0,files:[],limitations:[]};
    const seen=new Map<string,string>();const digestParts:string[]=[];
    for(const f of batch.files){
      const mapping=(batch.mapping as Record<string,Mapping>)[f.id]??suggestMapping([],f.dataset as Dataset);
      const current=await this.db.tenant(ctx,tx=>tx.businessRecord.findMany({where:{enterpriseId:ctx.enterpriseId,shopId:batch.shopId,dataset:f.dataset,sourcePlatform:manifest.source_platform}}));
      const currentById=new Map(current.map(r=>[r.externalId,r]));let cursor:string|undefined;let count=0;
      const spec=f.spec as any;
      for(;;){
        const rows=await this.db.tenant(ctx,tx=>tx.stagingRow.findMany({where:{fileId:f.id},orderBy:{id:'asc'},take:1000,...(cursor?{cursor:{id:cursor},skip:1}:{})}));if(!rows.length)break;
        const decisions=rows.map(r=>{
          const normalized=normalizeRow(r.raw as Record<string,unknown>,mapping,f.dataset as Dataset);
          let decision='error';const prior=normalized.data?currentById.get(String(normalized.data.external_id)):undefined;
          if(mapping.excluded_rows.includes(r.id))decision='excluded';
          else if(normalized.data){
            decision=classifyChange(prior??null,normalized.data);
            if(['daily','ads'].includes(f.dataset)&&spec.value_semantics!=='period'){normalized.errors.push('汇总报表必须明确为期间发生量；累计/快照暂不自动计入');decision='error';}
            const identity=`${f.dataset}/${normalized.data.external_id}`;const h=hash(normalized.data);
            if(seen.has(identity))decision=seen.get(identity)===h?'batch_duplicate':'batch_conflict';else seen.set(identity,h);
          }
          if(normalized.errors.length&&decision!=='excluded')decision='error';
          summary[decision]=(summary[decision]??0)+1;count++;digestParts.push(hash({row:r.id,data:normalized.data,decision,baseVersion:prior?.version}));
          return {id:r.id,canonical:normalized.data?json(normalized.data):Prisma.DbNull,errors:normalized.errors,decision,baseRecordId:prior?.id??null,baseVersion:prior?.version??null};
        });
        await this.db.tenant(ctx,async tx=>{for(const d of decisions){const {id,...data}=d;await tx.stagingRow.update({where:{id},data});}});
        cursor=rows.at(-1)!.id;
      }
      summary.files.push({fileId:f.id,dataset:f.dataset,rows:count,expected:spec.source_expected_rows,completeness:spec.completeness,grain:spec.grain,limitations:spec.limitations,period_start:spec.period_start,period_end_exclusive:spec.period_end_exclusive});
      if(spec.source_expected_rows!==null&&spec.source_expected_rows!==count)summary.limitations.push(`${f.filename}: 声明行数与实际不一致`);
    }
    const state=summary.error?'needs_mapping':summary.conflict||summary.batch_conflict?'needs_review':'ready_for_confirmation';
    await this.db.tenant(ctx,async tx=>{
      await tx.$queryRaw`SELECT id FROM "ImportBatch" WHERE id=${batchId}::uuid FOR UPDATE`;
      const latest=await tx.importBatch.findUnique({where:{id:batchId}});if(latest?.previewVersion!==batch.previewVersion||hash(latest.mapping)!==hash(batch.mapping))return;
      await tx.importBatch.update({where:{id:batchId},data:{state,summary:json(summary),previewHash:hash({mapping:batch.mapping,rows:digestParts}),previewVersion:{increment:1},error:null}});
    });
  }
  async preview(ctx:Context,id:string,page=1,fileId?:string){return this.db.tenant(ctx,async tx=>{
    const b=await tx.importBatch.findFirst({where:{id,enterpriseId:ctx.enterpriseId,...shopWhere(ctx)},include:{files:true}});if(!b)fail('BATCH','批次不存在',404);
    for(const f of b.files)permission(ctx,f.dataset);
    const ids=b.files.filter(f=>!fileId||f.id===fileId).map(f=>f.id);const where={enterpriseId:ctx.enterpriseId,fileId:{in:ids}};
    const [rows,total]=await Promise.all([tx.stagingRow.findMany({where,take:50,skip:(page-1)*50,orderBy:[{fileId:'asc'},{rowNumber:'asc'}]}),tx.stagingRow.count({where})]);
    return {...b,rows,total,page};
  });}
  async confirm(ctx:Context,id:string,input:{previewVersion:number;previewHash:string;excludeInvalid:boolean},key:string){
    if(!key||key.length>160)fail('IDEMPOTENCY','确认需要有效 Idempotency-Key');
    return this.db.tenant(ctx,async tx=>{
      await tx.$queryRaw`SELECT id FROM "ImportBatch" WHERE id=${id}::uuid FOR UPDATE`;
      const b=await tx.importBatch.findFirst({where:{id,enterpriseId:ctx.enterpriseId,...shopWhere(ctx)},include:{files:true}});if(!b)fail('BATCH','批次不存在',404);
      await shopLock(tx,ctx,b.shopId);
      const requestHash=hash({id,input});const cached=await tx.idempotency.findUnique({where:{enterpriseId_shopId_key:{enterpriseId:ctx.enterpriseId,shopId:b.shopId,key}}});if(cached){if(cached.requestHash!==requestHash)fail('IDEMPOTENCY','幂等键被不同请求使用',409);return cached.response;}
      if(b.state==='completed')return {id,state:'completed'};
      if(!['needs_review','needs_mapping','ready_for_confirmation'].includes(b.state)||b.previewVersion!==input.previewVersion||b.previewHash!==input.previewHash)fail('PREVIEW_STALE','预览已变化，请重新查看并确认',409);
      const summary=b.summary as any;if((summary.error||summary.conflict||summary.batch_conflict)&&!input.excludeInvalid)fail('REVIEW','存在错误或冲突；请更正或明确排除这些行');
      for(const f of b.files)permission(ctx,f.dataset,true);
      await tx.importBatch.update({where:{id},data:{state:'committing'}});
      const manifest=b.manifest as unknown as Manifest;let count=0;
      for(const f of b.files){
        const rows=await tx.stagingRow.findMany({where:{fileId:f.id,decision:{in:['new','update']}}});
        for(const row of rows){
          const data=row.canonical as Record<string,any>;const identity={enterpriseId:ctx.enterpriseId,shopId:b.shopId,dataset:f.dataset,sourcePlatform:manifest.source_platform,externalId:String(data.external_id)};
          const current=await tx.businessRecord.findUnique({where:{enterpriseId_shopId_dataset_sourcePlatform_externalId:identity}});
          if((current?.version??null)!==row.baseVersion)fail('DATA_CHANGED','正式数据已变化，请重新生成预览',409);
          const next=current?await tx.businessRecord.update({where:{id:current.id},data:{data:json(data),version:{increment:1},sourceUpdatedAt:data.source_updated_at?new Date(data.source_updated_at):null,sourceRowId:row.id}}):await tx.businessRecord.create({data:{...identity,data:json(data),sourceUpdatedAt:data.source_updated_at?new Date(data.source_updated_at):null,sourceRowId:row.id}});
          await tx.recordVersion.create({data:{enterpriseId:ctx.enterpriseId,shopId:b.shopId,recordId:next.id,version:next.version,data:next.data as Prisma.InputJsonValue,sourceRowId:row.id,reason:`import:${id}`}});count++;
        }
      }
      const result={id,state:'completed',committed:count,excluded:(summary.error??0)+(summary.conflict??0)+(summary.batch_conflict??0)+(summary.excluded??0)};
      await tx.importBatch.update({where:{id},data:{state:'completed',confirmedBy:ctx.userId}});
      await tx.idempotency.create({data:{enterpriseId:ctx.enterpriseId,shopId:b.shopId,key,requestHash,response:result}});await audit(tx,ctx,'import.confirm',id,result,b.shopId);
      return result;
    },600000);
  }
}
