import { Injectable,Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { Db,Context,audit,shopWhere,Tx } from './db';
import { permission } from './auth';
import { shopLock } from './business';
import { fail } from './errors';
const decimal=z.string().regex(/^-?\d+(\.\d{1,8})?$/);
const json=(v:any):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(v));
async function version(tx:Tx,ctx:Context,record:any,data:any,reason:string){const next=await tx.businessRecord.update({where:{id:record.id},data:{data:json(data),version:{increment:1}}});await tx.recordVersion.create({data:{enterpriseId:ctx.enterpriseId,shopId:record.shopId,recordId:record.id,version:next.version,data:next.data as Prisma.InputJsonValue,reason}});return next;}
@Injectable()
export class Operations {
  constructor(@Inject(Db) private db:Db){}
  async receive(ctx:Context,purchaseId:string,body:unknown,key:string){
    permission(ctx,'purchases',true);permission(ctx,'inventory',true);
    const p=z.object({inventoryId:z.string().uuid(),quantity:decimal,expectedPurchaseVersion:z.number().int(),expectedInventoryVersion:z.number().int()}).parse(body);
    const quantity=new Decimal(p.quantity);if(quantity.lte(0))fail('QUANTITY','收货数量必须为正');
    return this.db.tenant(ctx,async tx=>{
      const purchase=await tx.businessRecord.findFirst({where:{id:purchaseId,enterpriseId:ctx.enterpriseId,dataset:'purchases',...shopWhere(ctx)}});if(!purchase)fail('PURCHASE','采购单不存在',404);await shopLock(tx,ctx,purchase.shopId);
      const prior=await tx.idempotency.findUnique({where:{enterpriseId_shopId_key:{enterpriseId:ctx.enterpriseId,shopId:purchase.shopId,key}}});const requestHash=JSON.stringify({purchaseId,p});if(prior){if(prior.requestHash!==requestHash)fail('IDEMPOTENCY','幂等键已被其他操作使用',409);return prior.response;}
      const current=await tx.businessRecord.findUnique({where:{id:purchaseId}});const inventory=await tx.businessRecord.findFirst({where:{id:p.inventoryId,enterpriseId:ctx.enterpriseId,shopId:purchase.shopId,dataset:'inventory'}});if(!current||!inventory)fail('INVENTORY','库存记录不存在');
      if(current.version!==p.expectedPurchaseVersion||inventory.version!==p.expectedInventoryVersion)fail('VERSION_CONFLICT','采购或库存已变化',409);
      const d=current.data as any,i=inventory.data as any;if(['canceled','received'].includes(d.status))fail('PURCHASE_STATE','采购单不允许继续收货');
      if(d.product_id!==i.product_id||d.unit!==i.unit||i.ownership!=='owned')fail('UNIT','必须使用同商品、同单位的自有库存');
      const received=new Decimal(d.received_quantity).plus(quantity);if(received.gt(d.quantity))fail('QUANTITY','收货量超过采购总量');
      const nextP=await version(tx,ctx,current,{...d,received_quantity:received.toFixed(4),status:received.eq(d.quantity)?'received':'partial'},'purchase-receipt');const nextI=await version(tx,ctx,inventory,{...i,quantity:new Decimal(i.quantity).plus(quantity).toFixed(4),as_of:new Date().toISOString()},'purchase-receipt');
      await tx.inventoryMovement.create({data:{enterpriseId:ctx.enterpriseId,shopId:purchase.shopId,recordId:inventory.id,delta:quantity.toFixed(4),reservedDelta:'0',reason:'采购收货',referenceId:purchase.externalId,createdBy:ctx.userId}});
      const result={purchase:nextP,inventory:nextI};await tx.idempotency.create({data:{enterpriseId:ctx.enterpriseId,shopId:purchase.shopId,key,requestHash,response:json(result)}});await audit(tx,ctx,'purchase.receive',purchaseId,{quantity:p.quantity,inventoryId:p.inventoryId},purchase.shopId);return result;
    });
  }
  async refund(ctx:Context,orderId:string,body:unknown,key:string){
    permission(ctx,'orders',true);permission(ctx,'payments',true);
    const p=z.object({amount:decimal,occurredAt:z.string().datetime({offset:true}),expectedVersion:z.number().int(),externalId:z.string().min(1)}).parse(body);const amount=new Decimal(p.amount);if(amount.lte(0))fail('REFUND','退款金额必须为正');
    return this.db.tenant(ctx,async tx=>{
      const order=await tx.businessRecord.findFirst({where:{id:orderId,enterpriseId:ctx.enterpriseId,dataset:'orders',...shopWhere(ctx)}});if(!order)fail('ORDER','订单不存在',404);await shopLock(tx,ctx,order.shopId);
      const prior=await tx.idempotency.findUnique({where:{enterpriseId_shopId_key:{enterpriseId:ctx.enterpriseId,shopId:order.shopId,key}}});const requestHash=JSON.stringify({orderId,p});if(prior){if(prior.requestHash!==requestHash)fail('IDEMPOTENCY','幂等键冲突',409);return prior.response;}
      const current=await tx.businessRecord.findUnique({where:{id:orderId}});if(current!.version!==p.expectedVersion)fail('VERSION_CONFLICT','订单已变化',409);const d=current!.data as any;
      if(d.refund_total===undefined)fail('REFUND_BASE','累计退款未知，请先核对已有退款');const refunded=new Decimal(d.refund_total).plus(amount);if(refunded.gt(d.total))fail('REFUND','退款超过订单金额');
      const next=await version(tx,ctx,current,{...d,refund_total:refunded.toFixed(2),refund_at:p.occurredAt},'refund');
      const payment=await tx.businessRecord.create({data:{enterpriseId:ctx.enterpriseId,shopId:order.shopId,dataset:'payments',sourcePlatform:'manual',externalId:p.externalId,data:{external_id:p.externalId,order_id:order.externalId,occurred_at:p.occurredAt,amount:p.amount,currency:d.currency,direction:'out',kind:'refund'}}});await tx.recordVersion.create({data:{enterpriseId:ctx.enterpriseId,shopId:order.shopId,recordId:payment.id,version:1,data:payment.data as Prisma.InputJsonValue,reason:'refund-payment'}});
      const result={order:next,payment};await tx.idempotency.create({data:{enterpriseId:ctx.enterpriseId,shopId:order.shopId,key,requestHash,response:json(result)}});await audit(tx,ctx,'order.refund',orderId,{amount:p.amount,paymentId:payment.id},order.shopId);return result;
    });
  }
}
