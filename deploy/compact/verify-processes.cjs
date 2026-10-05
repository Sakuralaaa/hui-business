// Cloud-only acceptance: kill one worker and check supervised recovery.
const { readFile } = require('node:fs/promises');
(async () => {
  const pid = Number(await readFile('/tmp/hui/worker.pid', 'utf8'));
  process.kill(pid, 'SIGKILL');
  let restarted = false;
  for (let n = 0; n < 45; n++) {
    await new Promise(r => setTimeout(r, 1000));
    const current = Number(await readFile('/tmp/hui/worker.pid', 'utf8'));
    const ready = JSON.parse(await readFile('/tmp/hui/worker-ready.json', 'utf8'));
    if (current !== pid && ready.pid === current && Date.now() - ready.readyAt < 10000) { restarted = true; break; }
  }
  if (!restarted) throw Error('Worker did not recover');
  const health = await fetch('http://127.0.0.1:8080/api/health');
  if (!health.ok) throw Error('Combined readiness check failed');
  console.log('Worker recovered and combined readiness passed');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
