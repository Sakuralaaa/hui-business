#!/bin/sh
set -eu
mkdir -p /backups
while :; do
  name="hui-$(date -u +%Y%m%dT%H%M%SZ)"
  archive="/backups/$name.dump"
  pg_dump --dbname "$POSTGRES_CONNECTION_STRING" --format=custom --file "$archive.partial"
  pg_restore --list "$archive.partial" >/dev/null
  mv "$archive.partial" "$archive"
  echo "DATABASE_BACKUP_SAVED $name"
  if [ ! -f /backups/restore-verified.txt ]; then
    restore_db="hui_restore_$(date -u +%Y%m%d%H%M%S)"
    export PGHOST="$POSTGRES_HOST" PGPORT="$POSTGRES_PORT" PGUSER="$POSTGRES_USERNAME" PGPASSWORD="$POSTGRES_PASSWORD"
    createdb "$restore_db"
    pg_restore --dbname "$restore_db" "$archive"
    count="$(psql --dbname "$restore_db" -At -c 'SELECT count(*) FROM "Enterprise"')"
    echo "DATABASE_RESTORE_VERIFIED enterprise_count=$count"
    printf '%s\n' "$name enterprise_count=$count" > /backups/restore-verified.txt
    dropdb "$restore_db"
  fi
  sleep 86400
done
