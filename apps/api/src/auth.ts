import { CanActivate, ExecutionContext, Injectable, Inject } from '@nestjs/common';
import { randomBytes,createHash,scryptSync,timingSafeEqual } from 'node:crypto';
import type {Request} from 'express';
import { Db,Context } from './db';
import { fail } from './errors';
export const tokenHash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function passwordHash(password:string){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
export function passwordValid(password:string,stored:string){const [salt,digest]=stored.split(':');if(!salt||!digest)return false;const actual=scryptSync(password,salt,64);const expected=Buffer.from(digest,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
export type AuthRequest=Request&{ctx:Context;grant?:{id:string;collectionRequestId:string}};
export const financeDatasets=['orders','order_lines','quotes','purchases','payments','expenses','ads','daily'];
export function permission(ctx:Context,dataset:string,write=false){
  if(write&&ctx.role==='viewer')fail('FORBIDDEN','当前角色只能查看',403);
  if(['payments','expenses'].includes(dataset)&&!['owner','admin','finance'].includes(ctx.role))fail('FORBIDDEN','当前角色没有财务权限',403);
  if(ctx.role==='finance'&&write&&!['payments','expenses','knowledge','tasks'].includes(dataset))fail('FORBIDDEN','财务角色不能修改此类资料',403);
}
export function admin(ctx:Context){if(!['owner','admin'].includes(ctx.role))fail('FORBIDDEN','需要企业管理员权限',403);}
export function finance(ctx:Context){if(!['owner','admin','finance'].includes(ctx.role))fail('FORBIDDEN','经营综合分析需要财务数据权限',403);}
export function assertShop(ctx:Context,shopId:string){if(ctx.shopIds!==null&&!ctx.shopIds.includes(shopId))fail('SHOP_SCOPE','不在可操作店铺范围内',403);}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(Db) private db:Db){}
  async canActivate(ec:ExecutionContext){
    const req=ec.switchToHttp().getRequest<AuthRequest>();
    const raw=req.cookies?.workbench_session;
    if(!raw)fail('AUTH','请先登录',401);
    const session=await this.db.session.findUnique({where:{tokenHash:tokenHash(raw)}});
    if(!session||session.expiresAt<new Date())fail('AUTH','登录已过期',401);
    const enterpriseId=String(req.headers['x-enterprise-id']??'');
    const membership=await this.db.membership.findFirst({where:{userId:session.userId,enterpriseId}});
    if(!membership)fail('TENANT','请选择有权限的企业',403);
    req.ctx={enterpriseId,userId:session.userId,role:membership.role,shopIds:['owner','admin'].includes(membership.role)?null:membership.shopIds};
    return true;
  }
}
@Injectable()
export class GrantGuard implements CanActivate {
  constructor(@Inject(Db) private db:Db){}
  async canActivate(ec:ExecutionContext){
    const req=ec.switchToHttp().getRequest<AuthRequest>();
    const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if(!bearer)fail('GRANT','需要任务上传凭据',401);
    // Security-definer lookup returns only scope; raw grant table is never exposed across tenants.
    const grants=await this.db.$queryRaw<Array<{id:string;enterpriseId:string;shopId:string;collectionRequestId:string;expiresAt:Date;revokedAt:Date|null}>>`SELECT * FROM lookup_upload_grant(${tokenHash(bearer)})`;
    const grant=grants[0];if(!grant||grant.revokedAt||grant.expiresAt<new Date())fail('GRANT','上传凭据无效、过期或已撤销',401);
    req.ctx={enterpriseId:grant.enterpriseId,userId:`grant:${grant.id}`,role:'upload',shopIds:[grant.shopId]};
    req.grant={id:grant.id,collectionRequestId:grant.collectionRequestId};return true;
  }
}
