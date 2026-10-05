// Run after a cloud container restart. Includes archived originals and readonly dump.
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const { readFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_WORKER });
(async () => {
  const files = await db.importFile.findMany({ where: { storageKey: { not: null } } });
  if (!files.length) throw Error('Missing acceptance originals');
  for (const file of files) {
    const content = await readFile('/data/objects/' + file.storageKey);
    if (createHash('sha256').update(content).digest('hex') !== file.sha256) throw Error('Restart lost original');
  }
  let status;
  for (let n = 0; n < 45; n++) {
    try { status = JSON.parse(await readFile('/data/backups/status.json', 'utf8')); } catch {}
    if (status?.state === 'ready' && status.originals >= files.length) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  if (status?.state !== 'ready' || status.originals < files.length) throw Error('Backup did not preserve originals');
  for (const file of files) {
    const content = await readFile('/data/backups/originals/' + file.storageKey);
    if (createHash('sha256').update(content).digest('hex') !== file.sha256) throw Error('Backup original hash mismatch');
  }
  console.log('Restart persistence and readonly backup verified originals=' + files.length);
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
