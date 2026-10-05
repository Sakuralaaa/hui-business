// Keep privileged migration/backup credentials out of the API and worker processes.
const { writeFileSync } = require('node:fs');
const mode = process.argv[2];
if (!['api', 'worker', 'backup'].includes(mode)) throw Error('Unknown application process');
if (mode === 'worker') process.env.DATABASE_URL = process.env.DATABASE_URL_WORKER;
if (mode === 'backup') {
  if (process.env.BACKUP_DATABASE_URL) process.env.DATABASE_URL = process.env.BACKUP_DATABASE_URL;
  else delete process.env.DATABASE_URL;
}
for (const key of Object.keys(process.env)) {
  if (key.startsWith('MIGRATION_') || key.startsWith('AWS_') || key.startsWith('S3_') ||
      ['DATABASE_URL_ADMIN','DATABASE_URL_WORKER','BOOTSTRAP_PASSWORD','BOOTSTRAP_EMAIL',
       'APP_DB_PASSWORD','WORKER_DB_PASSWORD','BACKUP_DB_PASSWORD','BOOTSTRAP_ON_START',
       'MIGRATE_S3_ON_START'].includes(key) || (mode !== 'backup' && key === 'BACKUP_DATABASE_URL')) delete process.env[key];
}
writeFileSync('/tmp/hui/' + mode + '.pid', String(process.pid));
if (mode === 'backup') require('./backup.cjs');
else require('/app/apps/api/dist/' + (mode === 'api' ? 'main' : 'worker') + '.js');
