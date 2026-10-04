#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$APP_DB_PASSWORD" --set=worker_password="$WORKER_DB_PASSWORD" <<'SQL'
CREATE ROLE workbench_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'app_password';
CREATE ROLE workbench_worker LOGIN NOSUPERUSER BYPASSRLS PASSWORD :'worker_password';
GRANT CONNECT ON DATABASE workbench TO workbench_app,workbench_worker;
GRANT USAGE,CREATE ON SCHEMA public TO workbench_worker;
SQL
