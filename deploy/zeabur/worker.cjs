// Keep the headless worker supervised and provide an internal health endpoint.
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const child = spawn(process.execPath, ['/app/apps/api/dist/worker.js'], { stdio: 'inherit', env: process.env });
const health = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ processAlive: child.exitCode === null, queueReadiness: 'verify-through-task' }));
}).listen(3001, '0.0.0.0');
child.on('exit', code => { health.close(); process.exit(code || 1); });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal));
