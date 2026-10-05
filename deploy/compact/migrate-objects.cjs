// Copy every old object before enabling the local storage backend. Safe to resume.
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('/app/node_modules/@aws-sdk/client-s3');
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const { mkdir, rename, writeFile, access, stat, unlink } = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { createHash } = require('node:crypto');
const { resolve, dirname, sep } = require('node:path');
const root = resolve(process.env.STORAGE_PATH || '/data/objects');
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_WORKER });
const s3 = new S3Client({ endpoint: process.env.MIGRATION_S3_ENDPOINT, region: process.env.MIGRATION_S3_REGION || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.MIGRATION_S3_ACCESS_KEY, secretAccessKey: process.env.MIGRATION_S3_SECRET_KEY } });
async function hash(path) { const sha = createHash('sha256'); for await (const bytes of createReadStream(path)) sha.update(bytes); return sha.digest('hex'); }
(async () => {
  const expected = new Map();
  const rows = [...await db.importFile.findMany({ where: { storageKey: { not: null } }, select: { storageKey: true, sha256: true } }), ...await db.asset.findMany({ select: { storageKey: true, sha256: true } })];
  for (const row of rows) expected.set(row.storageKey, row.sha256);
  let token, count = 0; const manifest = [];
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: process.env.MIGRATION_S3_BUCKET, ContinuationToken: token }));
    for (const item of page.Contents || []) {
      const key = item.Key, dest = resolve(root, key || '');
      if (!key || !/^[a-zA-Z0-9/_.-]+$/.test(key) || !dest.startsWith(root + sep)) throw Error('Invalid object key');
      await mkdir(dirname(dest), { recursive: true });
      const original = await s3.send(new GetObjectCommand({ Bucket: process.env.MIGRATION_S3_BUCKET, Key: key }));
      await unlink(dest + '.migrating').catch(() => {});
      await pipeline(original.Body, createWriteStream(dest + '.migrating', { flags: 'wx' }));
      const digest = await hash(dest + '.migrating');
      if (expected.has(key) && expected.get(key) !== digest) throw Error('Source hash mismatch');
      try { await access(dest); if (await hash(dest) !== digest) throw Error('Destination conflict'); await unlink(dest + '.migrating'); }
      catch (e) { if (e.code !== 'ENOENT') throw e; await rename(dest + '.migrating', dest); }
      manifest.push({ key, sha256: digest, size: (await stat(dest)).size }); expected.delete(key); count++;
    }
    token = page.NextContinuationToken;
  } while (token);
  if (expected.size) throw Error('Database references missing source objects');
  await writeFile('/data/migration-originals.json', JSON.stringify({ completedAt: new Date().toISOString(), objects: manifest }));
  console.log('COMPACT_ORIGINALS_MIGRATED objects=' + count);
})().catch(() => { console.error('Original migration failed; previous storage must be retained'); process.exitCode = 1; }).finally(() => db.$disconnect());
