#!/bin/sh
set -eu
cd /app
npm run db:deploy
node /opt/hui/roles.cjs
npm run seed
node /opt/hui/bucket.cjs
unset DATABASE_URL_ADMIN DATABASE_URL APP_DB_PASSWORD WORKER_DB_PASSWORD BOOTSTRAP_PASSWORD
echo 'HUI_BOOTSTRAP_COMPLETE'
exec node -e 'require("http").createServer((req,res)=>res.end("initialized")).listen(3001,"0.0.0.0")'
