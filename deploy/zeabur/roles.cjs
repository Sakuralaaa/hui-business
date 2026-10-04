// Run once in the isolated bootstrap service, after schema installation.
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_ADMIN });
(async () => {
  for (const [role, key] of [['workbench_app', 'APP_DB_PASSWORD'], ['workbench_worker', 'WORKER_DB_PASSWORD']]) {
    const password = process.env[key];
    if (!password || !/^[a-f0-9]{48}$/.test(password)) throw new Error(`Invalid ${key}`);
    await db.$executeRawUnsafe(`ALTER ROLE ${role} LOGIN PASSWORD '${password}'`);
  }
  const [{ name }] = await db.$queryRawUnsafe('SELECT current_database() AS name');
  const quoted = '"' + name.replaceAll('"', '""') + '"';
  await db.$executeRawUnsafe(`GRANT CONNECT ON DATABASE ${quoted} TO workbench_app,workbench_worker`);
  await db.$executeRawUnsafe(`GRANT CREATE ON DATABASE ${quoted} TO workbench_worker`);
  await db.$executeRawUnsafe('GRANT USAGE,CREATE ON SCHEMA public TO workbench_worker');
  console.log('Application and worker database roles ready');
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
