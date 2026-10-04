import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
export type Context={enterpriseId:string;userId:string;role:string;shopIds:string[]|null};
export type Tx=Prisma.TransactionClient;
@Injectable()
export class Db extends PrismaClient {
  async tenant<T>(ctx:Context,fn:(tx:Tx)=>Promise<T>,timeout=120000):Promise<T>{
    return this.$transaction(async tx=>{
      await tx.$queryRaw`SELECT set_config('app.tenant_id',${ctx.enterpriseId},true),set_config('app.shop_ids',${ctx.shopIds===null?'*':ctx.shopIds.join(',')},true)`;
      return fn(tx);
    },{timeout,maxWait:10000});
  }
}
export function shopWhere(ctx:Context){return ctx.shopIds===null?{}:{shopId:{in:ctx.shopIds}};}
export async function audit(tx:Tx,ctx:Context,action:string,targetId:string,details:Prisma.InputJsonValue={},shopId?:string){
  await tx.audit.create({data:{enterpriseId:ctx.enterpriseId,shopId,actorId:ctx.userId,action,targetId,details}});
}
export async function enqueue(tx:Tx,ctx:Context,shopId:string,kind:string,payload:Prisma.InputJsonValue){
  return tx.workItem.create({data:{enterpriseId:ctx.enterpriseId,shopId,kind,payload}});
}
