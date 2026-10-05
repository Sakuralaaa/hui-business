// Execute inside the cloud bootstrap container. Writes only to a demo enterprise.
const { createHash } = require('node:crypto');
const origin = process.env.PUBLIC_URL;
const base = origin + '/api/v1';
let cookie = '', enterprise = '';
async function request(path, body, method = body === undefined ? 'GET' : 'POST', extra = {}, raw = false) {
  const headers = { 'Content-Type': 'application/json', Origin: origin, 'X-Enterprise-Id': enterprise, ...(cookie ? { Cookie: cookie } : {}), ...extra };
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  if (path === '/auth/login') cookie = response.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
  return raw ? Buffer.from(await response.arrayBuffer()) : response.json();
}
async function until(path, terminal) {
  for (let n = 0; n < 45; n++) {
    const value = await request(path);
    if (terminal.includes(value.state)) return value;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw Error('Cloud background task timed out: ' + path);
}
(async () => {
  const health = await fetch(origin + '/api/health');
  if (!health.ok) throw Error('Public HTTPS health check failed');
  const login = await request('/auth/login', { email: process.env.BOOTSTRAP_EMAIL, password: process.env.BOOTSTRAP_PASSWORD });
  const demos = login.memberships.filter(m => m.enterprise.mode === 'demo');
  if (demos.length !== 2 || login.memberships.length !== 3) throw Error('Missing isolated demo enterprises');
  enterprise = demos[0].enterpriseId;
  const shop = (await request('/shops'))[0];
  const task = await request('/collection-requests', { shopId: shop.id, datasets: ['knowledge'], periodStart: null, periodEnd: null, timezone: 'UTC', allowedMethods: ['simulation'], requiredFields: [], notes: 'Zeabur deployment acceptance: simulated source, no live store access' });
  const grant = await request('/collection-requests/' + task.id + '/upload-grants', {});
  const csv = Buffer.from('external_id,title,body,kind\nHUI-ZEABUR-DEPLOY-001,云端部署验证,此模拟资料用于验证原件保存与后台解析。,reference\n');
  const sha256 = createHash('sha256').update(csv).digest('hex');
  const manifest = { contract_version: '1.0', collection_request_id: task.id, collector: 'cloud_acceptance', source_platform: shop.platform, exported_at: new Date().toISOString(), files: [{ filename: 'deployment-demo.csv', dataset: 'knowledge', acquisition_method: 'simulation', source_timezone: 'UTC', source_expected_rows: 1, completeness: 'complete', sha256, size: csv.length }] };
  const uploadHeaders = { Authorization: 'Bearer ' + grant.token, 'Content-Type': 'application/json' };
  let response = await fetch(base + '/intake/sessions', { method: 'POST', headers: uploadHeaders, body: JSON.stringify(manifest) });
  if (!response.ok) throw Error('Create upload session: HTTP ' + response.status);
  const session = await response.json(), file = session.files[0];
  response = await fetch(base + '/intake/sessions/' + session.id + '/files/' + file.id, { method: 'PUT', headers: { Authorization: 'Bearer ' + grant.token, 'Content-Type': 'application/octet-stream', 'Content-Length': String(csv.length) }, body: csv });
  if (!response.ok) throw Error('Upload to durable original storage: HTTP ' + response.status);
  response = await fetch(base + '/intake/sessions/' + session.id + '/complete', { method: 'POST', headers: uploadHeaders });
  if (!response.ok) throw Error('Complete upload: HTTP ' + response.status);
  const preview = await until('/imports/' + session.id + '/preview', ['ready_for_confirmation', 'needs_review', 'needs_mapping', 'failed', 'rejected']);
  if (preview.state !== 'ready_for_confirmation' || preview.summary.error !== 0 || preview.summary.new + preview.summary.duplicate !== 1) throw Error('Unexpected import preview: ' + preview.state);
  const confirmation = { previewVersion: preview.previewVersion, previewHash: preview.previewHash, excludeInvalid: false };
  const result = await request('/imports/' + session.id + '/confirm', confirmation, 'POST', { 'Idempotency-Key': 'zeabur-' + session.id });
  const repeat = await request('/imports/' + session.id + '/confirm', confirmation, 'POST', { 'Idempotency-Key': 'zeabur-' + session.id });
  require('node:assert/strict').deepEqual(repeat, result, 'Confirmation idempotency failed');
  const original = await request('/imports/' + session.id + '/files/' + file.id, undefined, 'GET', {}, true);
  if (createHash('sha256').update(original).digest('hex') !== sha256) throw Error('Original download hash mismatch');
  enterprise = demos[1].enterpriseId;
  response = await fetch(base + '/imports/' + session.id + '/preview', { headers: { Cookie: cookie, 'X-Enterprise-Id': enterprise } });
  if (response.status !== 404) throw Error('Cross-enterprise import access was not denied');
  enterprise = demos[0].enterpriseId;
  const run = await request('/analysis-runs', { shopId: shop.id, kind: 'business', useAi: false });
  const report = await until('/analysis-runs/' + run.id, ['completed', 'failed']);
  if (report.state !== 'completed') throw Error('Deterministic analysis failed');
  await request('/upload-grants/' + grant.id + '/revoke', {});
  await request('/auth/logout', {});
  console.log(JSON.stringify({ passed: ['HTTPS', 'login and 3 enterprises', 'task scoped upload', 'durable original preservation', 'worker parsing', 'preview and idempotent confirmation', 'original SHA256 download', 'enterprise isolation', 'background deterministic analysis', 'grant revocation'], batchId: session.id, reportId: run.id, aiConfigured: false }));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
