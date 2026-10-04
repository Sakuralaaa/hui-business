import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { readFileSync,existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
async function main(){
  const db=new PrismaClient({datasourceUrl:process.env.DATABASE_URL_ADMIN??process.env.DATABASE_URL});
  await db.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "_WorkbenchSchema" (id integer primary key, hash text not null, installed_at timestamptz default now())');
  const schema=readFileSync('apps/api/prisma/schema.prisma','utf8');const hash=createHash('sha256').update(schema).digest('hex');const versions=await db.$queryRawUnsafe<Array<{hash:string}>>('SELECT hash FROM "_WorkbenchSchema" WHERE id=1');
  if(!versions.length){
    const sql=existsSync('apps/api/prisma/migrations/0001_initial.sql')?readFileSync('apps/api/prisma/migrations/0001_initial.sql','utf8'):execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel','apps/api/prisma/schema.prisma','--script'],{encoding:'utf8',env:{...process.env,DATABASE_URL:process.env.DATABASE_URL_ADMIN??process.env.DATABASE_URL}});
    // Prisma's executeRaw only accepts one statement; CLI db execute handles the generated schema script.
    execFileSync(process.execPath,['node_modules/prisma/build/index.js','db','execute','--stdin','--url',process.env.DATABASE_URL_ADMIN??process.env.DATABASE_URL!],{input:sql,stdio:['pipe','inherit','inherit']});
    await db.$executeRaw`INSERT INTO "_WorkbenchSchema" (id,hash) VALUES (1,${hash})`;
  }else if(versions[0]!.hash!==hash)throw Error('数据库版本与源代码不同；需要审阅升级迁移，禁止自动 db push');
  const statements=readFileSync('deploy/policies.sql','utf8').split('\n-- statement\n').filter(s=>s.trim());
  for(const statement of statements)await db.$executeRawUnsafe(statement);
  await db.$disconnect();console.log('Schema and tenant policies installed');
}
main().catch(e=>{console.error(e);process.exit(1);});
