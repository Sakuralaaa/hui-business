#!/bin/sh
set -eu
cd /app
mkdir -p /data/objects /data/backups /tmp/hui
if [ ! -f /data/.hui-owned-v1 ]; then
  chown -R node:node /data
  touch /data/.hui-owned-v1
fi
chown node:node /tmp/hui
if [ "${BOOTSTRAP_ON_START:-false}" = true ] && [ ! -f /data/.hui-initialized-v1 ]; then
  npm run db:deploy
  node deploy/zeabur/roles.cjs
  node deploy/compact/backup-role.cjs
  npm run seed
  touch /data/.hui-initialized-v1
fi
if [ "${MIGRATE_S3_ON_START:-false}" = true ]; then
  runuser -u node -- node deploy/compact/migrate-objects.cjs
fi
exec "$@"
