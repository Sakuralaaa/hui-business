import { Injectable,Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { Dataset,datasetSchema,recordSchema,hash,quoteScenario } from '@workbench/core';
import { Db,Context,audit,shopWhere,Tx } from './db';
import { assertShop,permission,admin,finance } from './auth';
import { fail } from './errors';
const json=(v:any):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(v));
const financialFields=['cost','cost_total','fee_total','unitCost','margin'];
export function presentRecord(ctx:Context,record:any){if(['owner','admin','finance'].includes(ctx.role))return record;const data={...record.data};for(const field of financialFields)delete data[field];return {...record,data};}
export async function shopLock(tx:Tx,ctx:Context,shopId:string){await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.enterpriseId+':'+shopId},0))::text AS locked`;}
@Injectable()
export class Business {
  constructor(@Inject(Db) private db:Db){}
  async list(ctx:Context,dataset:Dataset,shopId?:string,page=1,q=''){
    permission(ctx,dataset);if(shopId)assertShop(ctx,shopId);
    return this.db.tenant(ctx,async tx=>{
      const where:Prisma.BusinessRecordWhereInput={enterpriseId:ctx.enterpriseId,dataset,...shopWhere(ctx),...(shopId?{shopId}:{}),...(q?{externalId:{contains:q,mode:'insensitive'}}:{})};
      const [records,total]=await Promise.all([tx.businessRecord.findMany({where,skip:(page-1)*50,take:50,orderBy:{updatedAt:'desc'}}),tx.businessRecord.count({where})]);return {records:records.map(r=>presentRecord(ctx,r)),total,page};
    });
  }
  async save(ctx:Context,dataset:Dataset,body:any,id?:string){
    permission(ctx,dataset,true);const shopId=z.string().uuid().parse(body.shopId);assertShop(ctx,shopId);const data=recordSchema(dataset).parse(body.data) as Record<string,any>;
    if(!['owner','admin','finance'].includes(ctx.role)&&financialFields.some(f=>data[f]!==undefined))fail('FINANCE_FIELDS','当前角色不能修改成本字段',403);
    return this.db.tenant(ctx,async tx=>{
      await shopLock(tx,ctx,shopId);const shop=await tx.shop.findFirst({where:{id:shopId,enterpriseId:ctx.enterpriseId}});if(!shop)fail('SHOP','店铺不存在',404);
      let r;
      if(id){
        const current=await tx.businessRecord.findFirst({where:{id,shopId,enterpriseId:ctx.enterpriseId,dataset}});if(!current)fail('RECORD','记录不存在',404);
        if(current.version!==body.expectedVersion)fail('VERSION_CONFLICT','资料已更新，请重新加载',409);
        const merged={...data};if(!['owner','admin','finance'].includes(ctx.role))for(const f of financialFields){const v=(current.data as any)[f];if(v!==undefined)merged[f]=v;}
        if(merged.external_id!==current.externalId)fail('IDENTITY','更正时不能修改外部标识');
        r=await tx.businessRecord.update({where:{id},data:{data:json(merged),version:{increment:1}}});
      }else r=await tx.businessRecord.create({data:{enterpriseId:ctx.enterpriseId,shopId,dataset,sourcePlatform:'manual',externalId:data.external_id,data:json(data)}});
      await tx.recordVersion.create({data:{enterpriseId:ctx.enterpriseId,shopId,recordId:r.id,version:r.version,data:r.data as Prisma.InputJsonValue,reason:id?'manual-correction':'manual-create'}});await audit(tx,ctx,id?'record.update':'record.create',r.id,{dataset,version:r.version},shopId);return presentRecord(ctx,r);
    });
  }
  async history(ctx:Context,id:string){return this.db.tenant(ctx,async tx=>{const record=await tx.businessRecord.findFirst({where:{id,enterpriseId:ctx.enterpriseId,...shopWhere(ctx)}});if(!record)fail('RECORD','记录不存在',404);permission(ctx,record.dataset);const versions=await tx.recordVersion.findMany({where:{recordId:id},orderBy:{version:'desc'}});return versions.map(v=>presentRecord(ctx,v));});}
  async link(ctx:Context,body:any){
    if(ctx.role==='viewer')fail('FORBIDDEN','需要编辑权限',403);
    const p=z.object({shopId:z.string().uuid(),fromId:z.string().uuid(),toId:z.string().uuid(),kind:z.enum(['inquiry_order','inquiry_quote','inquiry_sample','inquiry_task','product_sku','same_entity'])}).parse(body);assertShop(ctx,p.shopId);
    return this.db.tenant(ctx,async tx=>{
      const records=await tx.businessRecord.findMany({where:{id:{in:[p.fromId,p.toId]},enterpriseId:ctx.enterpriseId,shopId:p.shopId}});if(records.length!==2)fail('LINK','关联记录必须存在于同一企业店铺');for(const r of records)permission(ctx,r.dataset);
      const from=records.find(r=>r.id===p.fromId)?.dataset,to=records.find(r=>r.id===p.toId)?.dataset;
      const expected:Record<string,[string,string]>={inquiry_order:['inquiries','orders'],inquiry_quote:['inquiries','quotes'],inquiry_sample:['inquiries','samples'],inquiry_task:['inquiries','tasks'],product_sku:['products','order_lines']};
      const pair=expected[p.kind];
      if(pair&&(from!==pair[0]||to!==pair[1]))fail('LINK','关联记录类型或方向不正确');
      const result=await tx.entityLink.upsert({where:{enterpriseId_shopId_fromId_toId_kind:{enterpriseId:ctx.enterpriseId,...p}},create:{enterpriseId:ctx.enterpriseId,...p,confirmedBy:ctx.userId},update:{}});await audit(tx,ctx,'entity.link',result.id,{kind:p.kind},p.shopId);return result;
    });
  }
  async links(ctx:Context,shopId:string,kind:string){
    const parsed=z.enum(['inquiry_order','inquiry_quote','inquiry_sample','inquiry_task','product_sku','same_entity']).parse(kind);const scope=z.string().uuid().parse(shopId);assertShop(ctx,scope);
    return this.db.tenant(ctx,async tx=>{
      const links=await tx.entityLink.findMany({where:{enterpriseId:ctx.enterpriseId,shopId:scope,kind:parsed},orderBy:{createdAt:'desc'},take:500});
      if(!links.length)return [];
      const records=await tx.businessRecord.findMany({where:{enterpriseId:ctx.enterpriseId,shopId:scope,id:{in:[...new Set(links.flatMap(link=>[link.fromId,link.toId]))]}}});
      const byId=new Map(records.map(record=>[record.id,record]));
      return links.flatMap(link=>{const from=byId.get(link.fromId),to=byId.get(link.toId);if(!from||!to)return [];permission(ctx,from.dataset);permission(ctx,to.dataset);return [{id:link.id,kind:link.kind,createdAt:link.createdAt,from:{id:from.id,dataset:from.dataset,externalId:from.externalId,data:presentRecord(ctx,from).data},to:{id:to.id,dataset:to.dataset,externalId:to.externalId,data:presentRecord(ctx,to).data}}];});
    });
  }
  async movement(ctx:Context,id:string,body:any){
    permission(ctx,'inventory',true);const p=z.object({delta:z.string(),reservedDelta:z.string(),reason:z.string().min(1).max(300),expectedVersion:z.number().int(),referenceId:z.string().optional()}).parse(body);
    const delta=new Decimal(p.delta),reserveDelta=new Decimal(p.reservedDelta);if(!delta.isFinite()||!reserveDelta.isFinite())fail('NUMBER','库存变化无效');
    return this.db.tenant(ctx,async tx=>{
      const current=await tx.businessRecord.findFirst({where:{id,enterpriseId:ctx.enterpriseId,dataset:'inventory',...shopWhere(ctx)}});if(!current)fail('INVENTORY','库存不存在',404);await shopLock(tx,ctx,current.shopId);
      const locked=await tx.businessRecord.findUnique({where:{id}});if(locked!.version!==p.expectedVersion)fail('VERSION_CONFLICT','库存已变化',409);
      const data=locked!.data as any;if(data.ownership!=='owned')fail('INVENTORY','供应商声称库存不能作为自有库存操作');
      const quantity=new Decimal(data.quantity).plus(delta),reserved=new Decimal(data.reserved).plus(reserveDelta);if(quantity.lt(0)||reserved.lt(0)||reserved.gt(quantity))fail('INVENTORY','库存或预占余额不足');
      const next=await tx.businessRecord.update({where:{id},data:{data:json({...data,quantity:quantity.toFixed(4),reserved:reserved.toFixed(4),as_of:new Date().toISOString()}),version:{increment:1}}});
      await tx.inventoryMovement.create({data:{enterpriseId:ctx.enterpriseId,shopId:current.shopId,recordId:id,delta:delta.toFixed(4),reservedDelta:reserveDelta.toFixed(4),reason:p.reason,referenceId:p.referenceId,createdBy:ctx.userId}});
      await tx.recordVersion.create({data:{enterpriseId:ctx.enterpriseId,shopId:current.shopId,recordId:id,version:next.version,data:next.data as Prisma.InputJsonValue,reason:`inventory:${p.reason}`}});await audit(tx,ctx,'inventory.movement',id,{delta:p.delta,reservedDelta:p.reservedDelta},current.shopId);return next;
    });
  }
  scenario(body:any){const input=z.object({quantity:z.string(),unitCost:z.string(),shipping:z.string(),fees:z.string(),targetMargin:z.string(),exchangeRate:z.string()}).parse(body);return quoteScenario(input);}
  async approve(ctx:Context,id:string){
    if(ctx.role==='viewer')fail('FORBIDDEN','需要编辑权限',403);
    return this.db.tenant(ctx,async tx=>{
      const draft=await tx.actionDraft.findFirst({where:{id,enterpriseId:ctx.enterpriseId,...shopWhere(ctx)}});if(!draft)fail('ACTION','草稿不存在',404);await shopLock(tx,ctx,draft.shopId);
      if((draft.evidence as any)?.restrictedFinance)finance(ctx);
      if(draft.status!=='draft')return draft;
      if(draft.kind==='content_apply'){
        const current=await tx.businessRecord.findFirst({where:{id:draft.recordId!,enterpriseId:ctx.enterpriseId,shopId:draft.shopId,dataset:'content'}});if(!current)fail('RECORD','内容不存在',404);permission(ctx,'content',true);
        if(current.version!==draft.baseVersion||hash(current.data)!==draft.sourceHash)fail('VERSION_CONFLICT','原内容已变化，请重新生成草稿',409);
        const data=recordSchema('content').parse({...current.data as any,...draft.payload as any,status:'draft'});
        const next=await tx.businessRecord.update({where:{id:current.id},data:{data:json(data),version:{increment:1}}});await tx.recordVersion.create({data:{enterpriseId:ctx.enterpriseId,shopId:draft.shopId,recordId:next.id,version:next.version,data:next.data as Prisma.InputJsonValue,reason:`action:${id}`}});
        await tx.actionDraft.update({where:{id},data:{status:'applied',approvedBy:ctx.userId,previousData:current.data as Prisma.InputJsonValue,appliedVersion:next.version}});
      }else await tx.actionDraft.update({where:{id},data:{status:'approved',approvedBy:ctx.userId}});
      await audit(tx,ctx,'action.approve',id,{kind:draft.kind},draft.shopId);return tx.actionDraft.findUnique({where:{id}});
    });
  }
  async undo(ctx:Context,id:string){return this.db.tenant(ctx,async tx=>{
    const draft=await tx.actionDraft.findFirst({where:{id,enterpriseId:ctx.enterpriseId,...shopWhere(ctx)}});if(!draft||draft.kind!=='content_apply'||draft.status!=='applied'||!draft.previousData)fail('UNDO','该操作不可撤销');permission(ctx,'content',true);await shopLock(tx,ctx,draft.shopId);
    const current=await tx.businessRecord.findUnique({where:{id:draft.recordId!}});if(!current||current.version!==draft.appliedVersion)fail('VERSION_CONFLICT','应用后内容又发生变化，不能直接撤销',409);
    const next=await tx.businessRecord.update({where:{id:current.id},data:{data:draft.previousData as Prisma.InputJsonValue,version:{increment:1}}});await tx.recordVersion.create({data:{enterpriseId:ctx.enterpriseId,shopId:draft.shopId,recordId:next.id,version:next.version,data:next.data as Prisma.InputJsonValue,reason:`undo:${id}`}});await tx.actionDraft.update({where:{id},data:{status:'undone'}});await audit(tx,ctx,'action.undo',id,{},draft.shopId);return next;
  });}
}
