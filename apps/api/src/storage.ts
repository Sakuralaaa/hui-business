import { Injectable } from '@nestjs/common';
import { S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand } from '@aws-sdk/client-s3';
import { resolve,dirname,sep } from 'node:path';
import { mkdir,copyFile,unlink,open } from 'node:fs/promises';
import { createReadStream,createWriteStream,constants } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { StorageProvider } from '@workbench/core';
@Injectable()
export class Storage implements StorageProvider {
  readonly root=resolve(process.env.STORAGE_PATH??'/data/objects');
  private s3=process.env.S3_BUCKET?new S3Client({region:process.env.S3_REGION??'us-east-1',endpoint:process.env.S3_ENDPOINT,forcePathStyle:true}):null;
  path(key:string){if(!/^[a-zA-Z0-9/_.-]+$/.test(key))throw Error('invalid storage key');const p=resolve(this.root,key);if(!p.startsWith(this.root+sep))throw Error('storage traversal');return p;}
  async put(key:string,path:string){
    if(this.s3){await this.s3.send(new PutObjectCommand({Bucket:process.env.S3_BUCKET!,Key:key,Body:createReadStream(path),IfNoneMatch:'*'}));return;}
    const dest=this.path(key);await mkdir(dirname(dest),{recursive:true});await copyFile(path,dest,constants.COPYFILE_EXCL);
  }
  async local(key:string){
    const dest=this.path(key);
    if(this.s3){await mkdir(dirname(dest),{recursive:true});const response=await this.s3.send(new GetObjectCommand({Bucket:process.env.S3_BUCKET!,Key:key}));if(!response.Body)throw Error('empty S3 object');await pipeline(response.Body as NodeJS.ReadableStream,createWriteStream(dest));}
    return dest;
  }
  async remove(key:string){if(this.s3)await this.s3.send(new DeleteObjectCommand({Bucket:process.env.S3_BUCKET!,Key:key}));else await unlink(this.path(key)).catch(()=>{});}
  async temp(){const key=`tmp/${crypto.randomUUID()}`;const path=this.path(key);await mkdir(dirname(path),{recursive:true});await (await open(path,'wx')).close();return path;}
}
