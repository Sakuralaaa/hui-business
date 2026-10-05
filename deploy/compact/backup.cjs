const { PrismaClient } = require('/app/node_modules/@prisma/client');
const { mkdir, rename, copyFile, readFile, writeFile, stat, access, unlink } = require('node:fs/promises');
const { createReadStream, constants } = require('node:fs');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { resolve, dirname, sep } = require('node:path');
const root = resolve(process.env.BACKUP_PATH || '/data/backups');
const objects = resolve(process.env.STORAGE_PATH || '/data/objects');
let stopping = false;
const db = process.env.DATABASE_URL ? new PrismaClient() : null;
function safe(base, key) {
  const path = resolve(base, key);
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || !path.startsWith(base + sep)) throw Error('Unsafe object path');
  return path;
}
async function hash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
async function status(value) {
  await writeFile(root + '/status.json.partial', JSON.stringify(value));
  await rename(root + '/status.json.partial', root + '/status.json');
}
async function command(binary, args, env = process.env) {
  await new Promise((yes, no) => {
    const child = spawn(binary, args, { env, stdio: ['ignore','ignore','pipe'] });
    // Avoid logging connection strings or decrypted credentials from child errors.
    child.stderr.resume();
    child.on('error', no); child.on('exit', code => code === 0 ? yes() : no(Error(binary + ' failed')));
  });
}
async function backup() {
  await mkdir(root, { recursive: true });
  if (!db) { await status({ state: 'disabled', reason: 'BACKUP_DATABASE_URL is not configured' }); return; }
  const stamp = new Date().toISOString().replaceAll(/[-:.]/g, '');
  const archive = root + '/hui-' + stamp + '.dump';
  await status({ state: 'running', startedAt: new Date().toISOString() });
  const url = new URL(process.env.DATABASE_URL);
  const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
  await command('pg_dump', ['--format=custom','--file',archive + '.partial'], env);
  await command('pg_restore', ['--list',archive + '.partial']);
  await rename(archive + '.partial', archive);
  const files = [
    ...await db.importFile.findMany({ where: { storageKey: { not: null } }, select: { storageKey: true, sha256: true } }),
    ...await db.asset.findMany({ select: { storageKey: true, sha256: true } })
  ];
  const unique = new Map();
  for (const file of files) {
    if (unique.has(file.storageKey) && unique.get(file.storageKey) !== file.sha256) throw Error('Conflicting original hashes');
    unique.set(file.storageKey, file.sha256);
  }
  const manifest = [];
  for (const [key, expected] of unique) {
    const source = safe(objects, key), dest = safe(root + '/originals', key);
    if (await hash(source) !== expected) throw Error('Original checksum mismatch');
    await mkdir(dirname(dest), { recursive: true });
    try { await access(dest); } catch {
      await unlink(dest + '.partial').catch(() => {});
      await copyFile(source, dest + '.partial', constants.COPYFILE_EXCL);
      await rename(dest + '.partial', dest);
    }
    if (await hash(dest) !== expected) throw Error('Backup checksum mismatch');
    manifest.push({ key, sha256: expected, size: (await stat(dest)).size });
  }
  await writeFile(archive + '.originals.json', JSON.stringify(manifest));
  await status({ state: 'ready', lastSuccess: new Date().toISOString(), archive, originals: manifest.length, offServer: false });
  console.log('COMPACT_BACKUP_SAVED originals=' + manifest.length);
}
async function run() {
  try { await backup(); } catch {
    let previous = {}; try { previous = JSON.parse(await readFile(root + '/status.json', 'utf8')); } catch {}
    await status({ ...previous, state: 'failed', failedAt: new Date().toISOString(), reason: 'Inspect database connectivity, disk space and original checksums' }).catch(() => {});
    console.error('COMPACT_BACKUP_FAILED');
  }
  if (!stopping) setTimeout(run, 24 * 3600000);
}
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, async () => { stopping = true; await db?.$disconnect(); process.exit(0); });
run();
