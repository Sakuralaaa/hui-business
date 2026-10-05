// Execute with the admin URL only during installation/migration.
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_ADMIN });
(async () => {
  const password = process.env.BACKUP_DB_PASSWORD;
  if (!/^[a-f0-9]{48}$/.test(password || '')) throw Error('Invalid backup role password');
  await db.$executeRawUnsafe("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='workbench_backup') THEN CREATE ROLE workbench_backup NOLOGIN NOSUPERUSER BYPASSRLS; END IF; END $$");
  await db.$executeRawUnsafe(`ALTER ROLE workbench_backup LOGIN PASSWORD '${password}'`);
  await db.$executeRawUnsafe('GRANT pg_read_all_data TO workbench_backup');
  const [{ name }] = await db.$queryRawUnsafe('SELECT current_database() AS name');
  await db.$executeRawUnsafe('GRANT CONNECT ON DATABASE "' + name.replaceAll('"', '""') + '" TO workbench_backup');
  console.log('Read-only database backup role ready');
})().catch(() => { console.error('Backup role setup failed'); process.exitCode = 1; }).finally(() => db.$disconnect());
