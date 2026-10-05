import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule,DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppModule } from './app';
import { Errors } from './errors';
import { Db } from './db';
import { readFile } from 'node:fs/promises';
async function main(){
  const app=await NestFactory.create(AppModule,{bodyParser:false});app.setGlobalPrefix('api/v1');
  const instance=app.getHttpAdapter().getInstance();instance.set('trust proxy',1);
  app.use(helmet());app.use(cookieParser());app.use((req:express.Request,res:express.Response,next:express.NextFunction)=>{
    if(['POST','PATCH','PUT','DELETE'].includes(req.method)&&req.headers.origin&&req.headers.origin!==process.env.PUBLIC_URL){res.status(403).json({code:'ORIGIN',message:'请求来源不被允许'});return;}
    if(/\/intake\/sessions\/[^/]+\/files\//.test(req.path)||req.path.endsWith('/assets/upload'))return next();
    return express.json({limit:'1mb'})(req,res,next);
  });
  app.useGlobalFilters(new Errors());
  const doc=SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('跨境经营工作台 API').setVersion('1.0').addCookieAuth('workbench_session').addBearerAuth().build());
  SwaggerModule.setup('api/docs',app,doc);instance.get('/api/health',async(_req:express.Request,res:express.Response)=>{
    try{
      await app.get(Db).$queryRaw`SELECT 1`;
      if(process.env.WORKER_HEARTBEAT_PATH){const heartbeat=JSON.parse(await readFile(process.env.WORKER_HEARTBEAT_PATH,'utf8'));if(Date.now()-heartbeat.readyAt>30000)throw Error('worker not ready');}
      res.json({ok:true,version:'0.1.0'});
    }catch{res.status(503).json({ok:false,message:'服务正在启动或后台任务暂不可用'});}
  });
  app.enableShutdownHooks();await app.listen(Number(process.env.PORT??3000),'0.0.0.0');
}
main().catch(e=>{console.error(e);process.exit(1);});
