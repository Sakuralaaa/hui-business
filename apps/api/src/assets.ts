import { Injectable,Inject } from '@nestjs/common';
import { createHash,randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { unlink,readFile } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { z } from 'zod';
import { Db,audit } from './db';
import { AuthRequest,assertShop,permission } from './auth';
import { Storage } from './storage';
import { fail } from './errors';
@Injectable()
export class Assets {
  constructor(@Inject(Db) private db:Db,@Inject(Storage) private storage:Storage){}
  async upload(req:AuthRequest,shopId:string){
    assertShop(req.ctx,shopId);permission(req.ctx,'products',true);
    const filename=z.string().min(1).max(180).parse(decodeURIComponent(String(req.headers['x-filename']??'')));if(!/\.(png|jpe?g|webp)$/i.test(filename)||/[\/\\]/.test(filename))fail('IMAGE','仅支持 PNG/JPEG/WebP');
    const temp=await this.storage.temp();const sha=createHash('sha256');let size=0;
    try{
      await pipeline(req,new Transform({transform(chunk,_,cb){size+=chunk.length;if(size>20*1024*1024)return cb(Error('图片超过 20 MiB'));sha.update(chunk);cb(null,chunk);}}),createWriteStream(temp));
      const image=sharp(temp,{limitInputPixels:40_000_000});const metadata=await image.metadata();if(!['png','jpeg','webp'].includes(metadata.format??''))fail('IMAGE','文件内容不是支持的图片');
      const {data,info}=await image.clone().resize(64,64,{fit:'fill'}).flatten({background:'#fff'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
      let total=0,white=0;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){if(x>4&&x<info.width-5&&y>4&&y<info.height-5)continue;const i=(y*info.width+x)*info.channels;total++;if(data[i]!>=245&&data[i+1]!>=245&&data[i+2]!>=245)white++;}
      const key=`${req.ctx.enterpriseId}/${shopId}/assets/${randomUUID()}`;await this.storage.put(key,temp);
      return this.db.tenant(req.ctx,async tx=>{const asset=await tx.asset.create({data:{enterpriseId:req.ctx.enterpriseId,shopId,filename,storageKey:key,sha256:sha.digest('hex'),kind:'original',metadata:{width:metadata.width??0,height:metadata.height??0,format:metadata.format??'',edgeWhiteRatio:white/total,appearanceReview:'pending',limitations:['边缘白色比例仅为确定性提示；不能证明平台审核通过','商品形状、颜色、Logo、文字的一致性需人工确认']}}});await audit(tx,req.ctx,'asset.upload',asset.id,{},shopId);return asset;});
    }finally{await unlink(temp).catch(()=>{});}
  }
  async get(req:AuthRequest,id:string){return this.db.tenant(req.ctx,async tx=>{const a=await tx.asset.findFirst({where:{id,enterpriseId:req.ctx.enterpriseId,...(req.ctx.shopIds===null?{}:{shopId:{in:req.ctx.shopIds}})}});if(!a)fail('ASSET','图片不存在',404);return {asset:a,path:await this.storage.local(a.storageKey)};});}
}
