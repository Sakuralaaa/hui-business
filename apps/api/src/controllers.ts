import { Body,Controller,Get,Post,Patch,Put,Param,Query,Req,Res,UseGuards,Inject,Headers } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request,Response } from 'express';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { DATASETS,datasetSchema,fields,labels,checkListing,compareListings,exportContent,ruleSchema } from '@workbench/core';
import { Db,audit,shopWhere } from './db';
import { SessionGuard,GrantGuard,AuthRequest,passwordHash,passwordValid,tokenHash,admin,assertShop,permission,finance } from './auth';
import { Intake } from './intake';
import { Imports } from './imports';
import { Business } from './business';
import { Analysis } from './analysis';
import { Models } from './models';
import { Assets } from './assets';
import { Storage } from './storage';
import { fail } from './errors';
import { Operations } from './operations';
const page=(p:unknown)=>z.coerce.number().int().min(1).max(100000).default(1).parse(p);
const uuid=(p:unknown)=>z.string().uuid().parse(p);
@ApiTags('登录')
@Controller('auth')
export class AuthController {
  private attempts=new Map<string,{n:number;until:number}>();
  constructor(@Inject(Db) private db:Db){}
  @Post('login') async login(@Body() body:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response){
    const p=z.object({email:z.string().email(),password:z.string().min(1).max(200)}).parse(body);const key=req.ip??'unknown';const attempt=this.attempts.get(key);if(attempt&&attempt.until>Date.now()&&attempt.n>=10)fail('RATE_LIMIT','登录尝试过多，请十分钟后重试',429);
    this.attempts.set(key,{n:attempt&&attempt.until>Date.now()?attempt.n+1:1,until:Date.now()+600000});if(this.attempts.size>10000)this.attempts.clear();
    const user=await this.db.user.findUnique({where:{email:p.email.toLowerCase()}});if(!user||!passwordValid(p.password,user.passwordHash))fail('LOGIN','邮箱或密码错误',401);this.attempts.delete(key);
    const raw=randomBytes(32).toString('base64url');await this.db.session.create({data:{userId:user.id,tokenHash:tokenHash(raw),expiresAt:new Date(Date.now()+86400000)}});
    res.cookie('workbench_session',raw,{httpOnly:true,secure:process.env.COOKIE_SECURE!=='false',sameSite:'strict',maxAge:86400000,path:'/api'});return {user:{id:user.id,name:user.name,email:user.email},memberships:await this.db.membership.findMany({where:{userId:user.id},include:{enterprise:true}})};
  }
  @Get('me') async me(@Req() req:Request){const raw=req.cookies?.workbench_session;if(!raw)fail('AUTH','未登录',401);const s=await this.db.session.findUnique({where:{tokenHash:tokenHash(raw)},include:{user:true}});if(!s||s.expiresAt<new Date())fail('AUTH','登录过期',401);return {user:{id:s.user.id,name:s.user.name,email:s.user.email},memberships:await this.db.membership.findMany({where:{userId:s.userId},include:{enterprise:true}})};}
  @Post('logout') async logout(@Req() req:Request,@Res({passthrough:true}) res:Response){if(req.cookies?.workbench_session)await this.db.session.deleteMany({where:{tokenHash:tokenHash(req.cookies.workbench_session)}});res.clearCookie('workbench_session',{path:'/api'});return {ok:true};}
  @Post('accept-invite') async accept(@Body() body:unknown){const p=z.object({token:z.string().min(20),name:z.string().min(1),password:z.string().min(12).max(200)}).parse(body);return this.db.$transaction(async tx=>{
    const invite=await tx.invite.findUnique({where:{tokenHash:tokenHash(p.token)}});if(!invite||invite.usedAt||invite.expiresAt<new Date())fail('INVITE','邀请无效或过期');
    const existing=await tx.user.findUnique({where:{email:invite.email}});if(existing)fail('INVITE','此邮箱已注册，请管理员直接添加成员');
    const user=await tx.user.create({data:{email:invite.email,name:p.name,passwordHash:passwordHash(p.password)}});await tx.membership.create({data:{enterpriseId:invite.enterpriseId,userId:user.id,role:invite.role,shopIds:invite.shopIds}});await tx.invite.update({where:{id:invite.id},data:{usedAt:new Date()}});return {ok:true};
  });}
}
@ApiTags('接收中心')
@Controller('intake/sessions')
@UseGuards(GrantGuard)
export class IntakeController {
  constructor(@Inject(Intake) private intake:Intake){}
  @Post() create(@Req() req:AuthRequest,@Body() body:unknown){return this.intake.createSession(req,body);}
  @Get(':id') status(@Req() req:AuthRequest,@Param('id') id:string){return this.intake.status(req,uuid(id));}
  @Put(':id/files/:fileId') upload(@Req() req:AuthRequest,@Param('id') id:string,@Param('fileId') fileId:string){return this.intake.upload(req,uuid(id),uuid(fileId));}
  @Post(':id/complete') complete(@Req() req:AuthRequest,@Param('id') id:string){return this.intake.complete(req,uuid(id));}
}
@ApiTags('经营工作台')
@Controller()
@UseGuards(SessionGuard)
export class AppController {
  constructor(@Inject(Db) private db:Db,@Inject(Intake) private intake:Intake,@Inject(Imports) private imports:Imports,@Inject(Business) private business:Business,@Inject(Analysis) private analysis:Analysis,@Inject(Models) private models:Models,@Inject(Assets) private assets:Assets,@Inject(Storage) private storage:Storage,@Inject(Operations) private operations:Operations){}
  @Get('schemas') schemas(){return DATASETS.map(d=>({dataset:d,label:labels[d],fields:Object.entries(fields[d]).map(([name,schema])=>{let inner=schema;while(inner instanceof z.ZodOptional||inner instanceof z.ZodDefault)inner=inner instanceof z.ZodOptional?inner.unwrap():inner.removeDefault();return {name,required:!schema.isOptional()&&!(schema instanceof z.ZodDefault),options:inner instanceof z.ZodEnum?inner.options:null};})}));}
  @Get('shops') shops(@Req() req:AuthRequest){return this.db.tenant(req.ctx,tx=>tx.shop.findMany({where:{enterpriseId:req.ctx.enterpriseId,...(req.ctx.shopIds===null?{}:{id:{in:req.ctx.shopIds}})}}));}
  @Post('shops') createShop(@Req() req:AuthRequest,@Body() body:unknown){admin(req.ctx);const p=z.object({name:z.string().min(1),platform:z.enum(['alibaba_com','amazon','shopify','other'])}).parse(body);return this.db.tenant(req.ctx,tx=>tx.shop.create({data:{enterpriseId:req.ctx.enterpriseId,...p,capabilities:{fileImport:true,apiRead:false,apiWrite:false,accio:'unverified'}}}));}
  @Patch('shops/:id/source-rules') sourceRules(@Req() req:AuthRequest,@Param('id') id:string,@Body() b:unknown){admin(req.ctx);const p=z.object({rules:z.record(datasetSchema,z.string().min(1))}).parse(b);return this.db.tenant(req.ctx,async tx=>{const shop=await tx.shop.findFirst({where:{id:uuid(id),enterpriseId:req.ctx.enterpriseId}});if(!shop)fail('SHOP','店铺不存在',404);await tx.shop.update({where:{id},data:{capabilities:{...shop.capabilities as any,sourceRules:p.rules}}});await audit(tx,req.ctx,'shop.source-rules',id,{rules:p.rules},id);return {ok:true};});}
  @Get('collection-requests') collections(@Req() req:AuthRequest){return this.db.tenant(req.ctx,tx=>tx.collectionRequest.findMany({where:{enterpriseId:req.ctx.enterpriseId,...shopWhere(req.ctx)},orderBy:{createdAt:'desc'},take:100}));}
  @Post('collection-requests') createCollection(@Req() req:AuthRequest,@Body() body:unknown){return this.intake.createCollection(req.ctx,body);}
  @Post('collection-requests/:id/upload-grants') grant(@Req() req:AuthRequest,@Param('id') id:string){return this.intake.issueGrant(req.ctx,uuid(id));}
  @Post('upload-grants/:id/revoke') revoke(@Req() req:AuthRequest,@Param('id') id:string){return this.intake.revoke(req.ctx,uuid(id));}
  @Get('imports') batches(@Req() req:AuthRequest){return this.db.tenant(req.ctx,async tx=>{const batches=await tx.importBatch.findMany({where:{enterpriseId:req.ctx.enterpriseId,...shopWhere(req.ctx)},orderBy:{createdAt:'desc'},take:100,include:{files:{select:{dataset:true}}}});return batches.filter(b=>b.files.every(f=>!['payments','expenses'].includes(f.dataset)||['owner','admin','finance'].includes(req.ctx.role)));});}
  @Get('imports/:id/preview') preview(@Req() req:AuthRequest,@Param('id') id:string,@Query('page') p:string,@Query('fileId') f:string){finance(req.ctx);return this.imports.preview(req.ctx,uuid(id),page(p),f?uuid(f):undefined);}
  @Patch('imports/:id/mapping') mapping(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:unknown){const p=z.object({fileId:z.string().uuid(),mapping:z.unknown()}).parse(body);return this.imports.updateMapping(req.ctx,uuid(id),{fileId:p.fileId,mapping:p.mapping});}
  @Post('imports/:id/confirm') confirm(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:unknown,@Headers('idempotency-key') key:string){const p=z.object({previewVersion:z.number().int(),previewHash:z.string(),excludeInvalid:z.boolean().default(false)}).parse(body);return this.imports.confirm(req.ctx,uuid(id),p,key);}
  @Get('imports/:id/files/:fileId') async original(@Req() req:AuthRequest,@Res() res:Response,@Param('id') id:string,@Param('fileId') fileId:string){const file=await this.db.tenant(req.ctx,async tx=>{const b=await tx.importBatch.findFirst({where:{id:uuid(id),enterpriseId:req.ctx.enterpriseId,...shopWhere(req.ctx)}});if(!b)fail('BATCH','批次不存在',404);const f=await tx.importFile.findFirst({where:{id:uuid(fileId),batchId:id}});if(!f?.storageKey)fail('FILE','文件不存在',404);finance(req.ctx);permission(req.ctx,f.dataset);return f;});res.download(await this.storage.local(file.storageKey!),file.filename);}
  @Get('records/:dataset') records(@Req() req:AuthRequest,@Param('dataset') d:string,@Query('shopId') s:string,@Query('page') p:string,@Query('q') q:string){return this.business.list(req.ctx,datasetSchema.parse(d),s?uuid(s):undefined,page(p),q??'');}
  @Post('records/:dataset') createRecord(@Req() req:AuthRequest,@Param('dataset') d:string,@Body() b:unknown){return this.business.save(req.ctx,datasetSchema.parse(d),b);}
  @Patch('records/:dataset/:id') updateRecord(@Req() req:AuthRequest,@Param('dataset') d:string,@Param('id') id:string,@Body() b:unknown){return this.business.save(req.ctx,datasetSchema.parse(d),b,uuid(id));}
  @Get('record-history/:id') history(@Req() req:AuthRequest,@Param('id') id:string){return this.business.history(req.ctx,uuid(id));}
  @Post('entity-links') link(@Req() req:AuthRequest,@Body() b:unknown){return this.business.link(req.ctx,b);}
  @Post('inventory/:id/movements') movement(@Req() req:AuthRequest,@Param('id') id:string,@Body() b:unknown){return this.business.movement(req.ctx,uuid(id),b);}
  @Post('purchases/:id/receive') receive(@Req() req:AuthRequest,@Param('id') id:string,@Body() b:unknown,@Headers('idempotency-key') key:string){if(!key||key.length>160)fail('IDEMPOTENCY','收货需要幂等键');return this.operations.receive(req.ctx,uuid(id),b,key);}
  @Post('orders/:id/refunds') refund(@Req() req:AuthRequest,@Param('id') id:string,@Body() b:unknown,@Headers('idempotency-key') key:string){if(!key||key.length>160)fail('IDEMPOTENCY','退款需要幂等键');return this.operations.refund(req.ctx,uuid(id),b,key);}
  @Post('quote-scenarios') scenario(@Req() req:AuthRequest,@Body() b:unknown){permission(req.ctx,'quotes');return this.business.scenario(b);}
  @Post('analysis-runs') createAnalysis(@Req() req:AuthRequest,@Body() b:unknown){return this.analysis.create(req.ctx,b);}
  @Get('analysis-runs') runs(@Req() req:AuthRequest){return this.db.tenant(req.ctx,tx=>tx.analysisRun.findMany({where:{enterpriseId:req.ctx.enterpriseId,...shopWhere(req.ctx),...(['owner','admin','finance'].includes(req.ctx.role)?{}:{createdBy:req.ctx.userId,kind:{not:'business'}})},orderBy:{createdAt:'desc'},take:100}));}
  @Get('analysis-runs/:id') report(@Req() req:AuthRequest,@Param('id') id:string){return this.analysis.get(req.ctx,uuid(id));}
  @Get('action-drafts') actions(@Req() req:AuthRequest){return this.db.tenant(req.ctx,async tx=>{const rows=await tx.actionDraft.findMany({where:{enterpriseId:req.ctx.enterpriseId,...shopWhere(req.ctx)},orderBy:{createdAt:'desc'},take:100});return rows.filter(r=>!(r.evidence as any)?.restrictedFinance||['owner','admin','finance'].includes(req.ctx.role));});}
  @Post('action-drafts/:id/approve') approve(@Req() req:AuthRequest,@Param('id') id:string){return this.business.approve(req.ctx,uuid(id));}
  @Post('action-drafts/:id/undo') undo(@Req() req:AuthRequest,@Param('id') id:string){return this.business.undo(req.ctx,uuid(id));}
  @Post('action-drafts/:id/complete') completeAction(@Req() req:AuthRequest,@Param('id') id:string,@Body() b:unknown){const p=z.object({result:z.string().min(1).max(3000)}).parse(b);if(req.ctx.role==='viewer')fail('FORBIDDEN','需要编辑权限',403);return this.db.tenant(req.ctx,async tx=>{const a=await tx.actionDraft.findFirst({where:{id:uuid(id),enterpriseId:req.ctx.enterpriseId,...shopWhere(req.ctx),status:'approved'}});if(!a)fail('ACTION','草稿未确认或不可访问');if((a.evidence as any)?.restrictedFinance)finance(req.ctx);await tx.actionDraft.update({where:{id},data:{status:'completed',payload:{...a.payload as any,executionResult:p.result}}});await audit(tx,req.ctx,'action.complete',id,{result:p.result},a.shopId);return {ok:true};});}
  @Get('model-config') config(@Req() req:AuthRequest){return this.models.settings(req.ctx);}
  @Put('model-config') saveConfig(@Req() req:AuthRequest,@Body() b:unknown){return this.models.save(req.ctx,b);}
  @Get('model-calls') calls(@Req() req:AuthRequest){admin(req.ctx);return this.db.tenant(req.ctx,tx=>tx.modelCall.findMany({where:{enterpriseId:req.ctx.enterpriseId},orderBy:{createdAt:'desc'},take:200}));}
  @Get('templates') async templates(){return JSON.parse(await readFile(resolve(process.env.CATALOG_PATH??'catalog','templates.json'),'utf8'));}
  @Post('content/check') check(@Body() b:any){const p=z.object({content:z.object({title:z.string(),description:z.string(),bullets:z.string().optional()}),rules:ruleSchema}).parse(b);return checkListing(p.content,p.rules);}
  @Post('content/compare') compare(@Body() b:any){const c=z.object({title:z.string(),description:z.string(),bullets:z.string().optional()});const p=z.object({yours:c,competitor:c}).parse(b);return compareListings(p.yours,p.competitor);}
  @Post('content/export') contentExport(@Body() b:any){const p=z.object({content:z.object({title:z.string(),description:z.string(),bullets:z.string().optional()}),format:z.enum(['csv','txt'])}).parse(b);return {content:exportContent(p.content,p.format),limitations:['内容草稿导出，不是平台已认证的刊登模板']};}
  @Post('assets/upload') uploadAsset(@Req() req:AuthRequest,@Query('shopId') shopId:string){return this.assets.upload(req,uuid(shopId));}
  @Get('assets') listAssets(@Req() req:AuthRequest){return this.db.tenant(req.ctx,tx=>tx.asset.findMany({where:{enterpriseId:req.ctx.enterpriseId,...shopWhere(req.ctx)},orderBy:{createdAt:'desc'},take:100}));}
  @Get('assets/:id') async getAsset(@Req() req:AuthRequest,@Res() res:Response,@Param('id') id:string){const a=await this.assets.get(req,uuid(id));res.setHeader('Content-Type',`image/${(a.asset.metadata as any).format}`);res.sendFile(a.path);}
  @Get('knowledge/search') search(@Req() req:AuthRequest,@Query('q') q:string,@Query('shopId') shopId:string){assertShop(req.ctx,uuid(shopId));const query=z.string().min(1).max(300).parse(q);return this.db.tenant(req.ctx,tx=>tx.$queryRaw`SELECT id,data->>'title' AS title,data->>'body' AS body FROM "BusinessRecord" WHERE "enterpriseId"=${req.ctx.enterpriseId}::uuid AND "shopId"=${shopId}::uuid AND dataset='knowledge' AND to_tsvector('simple',coalesce(data->>'title','')||' '||coalesce(data->>'body','')) @@ plainto_tsquery('simple',${query}) LIMIT 30`);}
  @Get('audits') audits(@Req() req:AuthRequest){admin(req.ctx);return this.db.tenant(req.ctx,tx=>tx.audit.findMany({where:{enterpriseId:req.ctx.enterpriseId},orderBy:{createdAt:'desc'},take:100}));}
  @Get('members') members(@Req() req:AuthRequest){admin(req.ctx);return this.db.membership.findMany({where:{enterpriseId:req.ctx.enterpriseId},include:{user:{select:{id:true,name:true,email:true}}}});}
  @Post('invites') invite(@Req() req:AuthRequest,@Body() b:unknown){admin(req.ctx);const p=z.object({email:z.string().email(),role:z.enum(['admin','sales','operations','finance','viewer']),shopIds:z.array(z.string().uuid()).min(1)}).parse(b);const token=randomBytes(32).toString('base64url');return this.db.tenant(req.ctx,async tx=>{const shops=await tx.shop.count({where:{enterpriseId:req.ctx.enterpriseId,id:{in:p.shopIds}}});if(shops!==p.shopIds.length)fail('SHOP','邀请包含无效店铺');const existing=await tx.user.findUnique({where:{email:p.email.toLowerCase()}});if(existing){await tx.membership.upsert({where:{enterpriseId_userId:{enterpriseId:req.ctx.enterpriseId,userId:existing.id}},create:{enterpriseId:req.ctx.enterpriseId,userId:existing.id,role:p.role,shopIds:p.shopIds},update:{role:p.role,shopIds:p.shopIds}});return {added:true};}await tx.invite.create({data:{enterpriseId:req.ctx.enterpriseId,email:p.email.toLowerCase(),role:p.role,shopIds:p.shopIds,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+7*86400000)}});return {token,expiresInDays:7};});}
}
