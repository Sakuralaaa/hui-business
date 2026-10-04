import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import PgBoss from 'pg-boss';
import { AppModule } from './app';
import { Db,Context } from './db';
import { Imports } from './imports';
import { Analysis } from './analysis';
async function main(){
  if(process.env.DATABASE_URL_WORKER)process.env.DATABASE_URL=process.env.DATABASE_URL_WORKER;
  const app=await NestFactory.createApplicationContext(AppModule);const db=app.get(Db),imports=app.get(Imports),analysis=app.get(Analysis);
  const boss=new PgBoss({connectionString:process.env.DATABASE_URL!,schema:'pgboss'});await boss.start();await boss.createQueue('workbench');
  await boss.work<{workId:string}>('workbench',{batchSize:1},async jobs=>{
    for(const job of jobs){
      const item=await db.workItem.findUnique({where:{id:job.data.workId}});if(!item||item.state==='completed')continue;
      const ctx:Context={enterpriseId:item.enterpriseId,shopIds:[item.shopId],role:'owner',userId:'worker'};
      await db.workItem.update({where:{id:item.id},data:{state:'running',attempts:{increment:1}}});
      try{
        const p=item.payload as any;
        if(item.kind==='parse')await imports.parse(ctx,p.batchId);
        else if(item.kind==='preview')await imports.previewBuild(ctx,p.batchId);
        else if(item.kind==='analysis'){
          const run=await db.analysisRun.findUnique({where:{id:p.runId}});if(!run||run.enterpriseId!==ctx.enterpriseId||run.shopId!==item.shopId)throw Error('analysis scope mismatch');
          const member=await db.membership.findUnique({where:{enterpriseId_userId:{enterpriseId:ctx.enterpriseId,userId:run.createdBy}}});if(!member)throw Error('分析发起人已无企业权限');
          ctx.userId=member.userId;ctx.role=member.role;ctx.shopIds=['owner','admin'].includes(member.role)?null:member.shopIds;if(ctx.shopIds!==null&&!ctx.shopIds.includes(item.shopId))throw Error('分析发起人已无店铺权限');
          await analysis.execute(ctx,p.runId);
        }else throw Error('unsupported work item');
        await db.workItem.update({where:{id:item.id},data:{state:'completed',error:null}});
      }catch(e){await db.workItem.update({where:{id:item.id},data:{state:'failed',error:e instanceof Error?e.message:'后台任务失败'}});throw e;}
    }
  });
  async function dispatch(){const items=await db.workItem.findMany({where:{state:{in:['pending','dispatched']}},take:50,orderBy:{createdAt:'asc'}});for(const item of items){await boss.send('workbench',{workId:item.id},{singletonKey:item.id,retryLimit:2,retryDelay:15,expireInSeconds:900});await db.workItem.updateMany({where:{id:item.id,state:'pending'},data:{state:'dispatched'}});}}
  await dispatch();const interval=setInterval(()=>dispatch().catch(e=>console.error('dispatch failed',e.name)),3000);
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{clearInterval(interval);await boss.stop();await app.close();process.exit(0);});
}
main().catch(e=>{console.error(e);process.exit(1);});
