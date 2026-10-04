const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('/app/node_modules/@aws-sdk/client-s3');
const { mkdir, access, rename, writeFile } = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { dirname, resolve } = require('node:path');
const { createServer } = require('node:http');
const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: true });
let status = { state: 'starting', lastSuccess: null, objects: 0 };
async function backup() {
  status.state = 'running'; let continuation, objects = 0;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, ContinuationToken: continuation }));
    for (const item of page.Contents || []) {
      if (!item.Key || !/^[a-zA-Z0-9/_\.-]+$/.test(item.Key)) throw Error('Unsafe object key');
      const path = resolve('/backups/objects', item.Key);
      if (!path.startsWith('/backups/objects/')) throw Error('Unsafe backup path');
      try { await access(path); } catch {
        await mkdir(dirname(path), { recursive: true });
        const file = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: item.Key }));
        await pipeline(file.Body, createWriteStream(path + '.partial'));
        await rename(path + '.partial', path);
      }
      objects++;
    }
    continuation = page.NextContinuationToken;
  } while (continuation);
  status = { state: 'ready', lastSuccess: new Date().toISOString(), objects };
  await writeFile('/backups/objects-status.json', JSON.stringify(status));
  console.log('ORIGINALS_BACKUP_SAVED objects=' + objects);
}
async function run() { try { await backup(); } catch(e) { status.state = 'failed'; console.error('Originals backup failed: ' + e.name); } setTimeout(run, 86400000); }
createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(status));}).listen(3001,'0.0.0.0');
run();
