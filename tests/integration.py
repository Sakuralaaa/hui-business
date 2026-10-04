"""Cloud-only API acceptance: real PostgreSQL, worker and external Python uploader."""
import http.cookiejar
import json
import os
import pathlib
import subprocess
import tempfile
import time
import urllib.request
import urllib.error

BASE='http://localhost:3000/api/v1'
jar=http.cookiejar.CookieJar()
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
tenant=''
def call(path, data=None, method=None, headers=None, expected=200):
    h={'Content-Type':'application/json','X-Enterprise-Id':tenant}
    h.update(headers or {})
    body=json.dumps(data).encode() if data is not None else None
    req=urllib.request.Request(BASE+path,body,h,method=method or ('POST' if data is not None else 'GET'))
    try:
        with opener.open(req,timeout=30) as r:
            status=r.status;value=json.load(r)
    except urllib.error.HTTPError as error:
        status=error.code;value=json.load(error)
    if status != expected:
        raise AssertionError(path+' expected '+str(expected)+' got '+str(status)+' '+json.dumps(value))
    return value
def wait_preview(batch):
    for _ in range(60):
        preview=call('/imports/'+batch+'/preview')
        if preview['state'] in ('needs_mapping','needs_review','ready_for_confirmation','rejected','failed'): return preview
        time.sleep(1)
    raise AssertionError('import timed out')
def wait_run(run_id):
    for _ in range(60):
        report=call('/analysis-runs/'+run_id)
        if report['state'] in ('completed','failed'):return report
        time.sleep(1)
    raise AssertionError('analysis timed out')
def upload(task, grant, directory, manifest, state):
    file=directory/'manifest.json';file.write_text(json.dumps(manifest),encoding='utf-8')
    result=subprocess.run(['python3','bridge/accio-bridge/scripts/upload.py','--api-base',BASE,'--manifest',str(file),'--directory',str(directory),'--state',str(state)],env={**os.environ,'HUI_UPLOAD_TOKEN':grant['token']},text=True,capture_output=True,timeout=120)
    if result.returncode: raise AssertionError(result.stdout+result.stderr)
    return json.loads(result.stdout.splitlines()[-1])['session_id']
def main():
    global tenant
    for _ in range(30):
        try:
            urllib.request.urlopen('http://localhost:3000/api/health',timeout=2);break
        except OSError: time.sleep(1)
    session=call('/auth/login',{'email':os.environ['BOOTSTRAP_EMAIL'],'password':os.environ['BOOTSTRAP_PASSWORD']},expected=201)
    demos=[m for m in session['memberships'] if m['enterprise']['mode']=='demo']
    assert len(demos)==2
    tenant=demos[0]['enterpriseId'];shop=call('/shops')[0]
    task=call('/collection-requests',{'shopId':shop['id'],'datasets':['orders'],'periodStart':None,'periodEnd':None,'timezone':'UTC','allowedMethods':['simulation','native_export'],'requiredFields':[],'notes':'cloud integration'},expected=201)
    grant=call('/collection-requests/'+task['id']+'/upload-grants',{},expected=201)
    with tempfile.TemporaryDirectory() as temp:
        directory=pathlib.Path(temp);(directory/'orders.csv').write_text('external_id,channel,ordered_at,currency,total,refund_total,cost_total,fee_total,status,source_updated_at\n000009,retail,2026-10-01T00:00:00Z,USD,100,10,50,5,completed,2026-10-05T00:00:00Z\n',encoding='utf-8')
        manifest={'contract_version':'1.0','collection_request_id':task['id'],'collector':'external_python','source_platform':shop['platform'],'exported_at':'2026-10-05T00:00:00Z','files':[{'filename':'orders.csv','dataset':'orders','acquisition_method':'simulation','source_timezone':'UTC','source_expected_rows':1,'completeness':'complete'}]}
        batch=upload(task,grant,directory,manifest,directory/'state1.json');preview=wait_preview(batch)
        assert preview['summary']['new']==1 and preview['summary']['error']==0, preview
        body={'previewVersion':preview['previewVersion'],'previewHash':preview['previewHash'],'excludeInvalid':False}
        result=call('/imports/'+batch+'/confirm',body,headers={'Idempotency-Key':'cloud-first'},expected=201)
        assert result['committed']==1
        assert call('/imports/'+batch+'/confirm',body,headers={'Idempotency-Key':'cloud-first'},expected=201)==result
        batch2=upload(task,grant,directory,manifest,directory/'state2.json');preview2=wait_preview(batch2)
        assert preview2['summary']['duplicate']==1
        call('/imports/'+batch2+'/confirm',{'previewVersion':preview2['previewVersion'],'previewHash':preview2['previewHash'],'excludeInvalid':False},headers={'Idempotency-Key':'cloud-second'},expected=201)
        records=call('/records/orders?shopId='+shop['id']+'&q=000009')['records'];assert len(records)==1 and records[0]['externalId']=='000009'
        record_id=records[0]['id']
        tenant=demos[1]['enterpriseId']
        call('/imports/'+batch+'/preview',expected=404)
        call('/record-history/'+record_id,expected=404)
        assert not call('/records/orders?q=000009')['records']
        tenant=demos[0]['enterpriseId']
        # The upload token cannot enter normal business endpoints.
        plain=urllib.request.build_opener()
        req=urllib.request.Request(BASE+'/records/orders',headers={'Authorization':'Bearer '+grant['token'],'X-Enterprise-Id':tenant})
        try: plain.open(req);raise AssertionError('grant could read business records')
        except urllib.error.HTTPError as e: assert e.code==401
        # Explicit revocation must reject status and upload requests.
        call('/upload-grants/'+grant['id']+'/revoke',{},expected=201)
        req=urllib.request.Request(BASE+'/intake/sessions/'+batch,headers={'Authorization':'Bearer '+grant['token']})
        try: plain.open(req);raise AssertionError('revoked grant accepted')
        except urllib.error.HTTPError as e: assert e.code==401
    run=call('/analysis-runs',{'shopId':shop['id'],'kind':'business','useAi':False},expected=201)
    for _ in range(45):
        report=call('/analysis-runs/'+run['id'])
        if report['state']=='completed':break
        if report['state']=='failed':raise AssertionError(report)
        time.sleep(1)
    assert report['state']=='completed',report
    assert any(g['dataset']=='orders' for g in report['metrics']['data_gates']) # overlapping sources need a rule
    call('/shops/'+shop['id']+'/source-rules',{'rules':{'orders':shop['platform']}},method='PATCH')
    run=call('/analysis-runs',{'shopId':shop['id'],'kind':'business','useAi':False},expected=201)
    for _ in range(45):
        report=call('/analysis-runs/'+run['id'])
        if report['state']=='completed':break
        time.sleep(1)
    assert report['metrics']['currencies'][0]['revenue']=='90.00',report
    assert report['metrics']['currencies'][0]['contribution_profit']=='35.00',report
    inventory=call('/records/inventory?shopId='+shop['id'])['records'][0]
    purchase=call('/records/purchases?shopId='+shop['id'])['records'][0]
    inventory=next(r for r in call('/records/inventory?shopId='+shop['id'])['records'] if r['data']['product_id']==purchase['data']['product_id'])
    receipt={'inventoryId':inventory['id'],'quantity':'10','expectedPurchaseVersion':purchase['version'],'expectedInventoryVersion':inventory['version']}
    received=call('/purchases/'+purchase['id']+'/receive',receipt,headers={'Idempotency-Key':'receipt-once'},expected=201)
    assert received['purchase']['data']['received_quantity']=='110.0000'
    assert call('/purchases/'+purchase['id']+'/receive',receipt,headers={'Idempotency-Key':'receipt-once'},expected=201)==received
    order=call('/records/orders?shopId='+shop['id']+'&q=000009')['records'][0]
    refunded=call('/orders/'+order['id']+'/refunds',{'amount':'5','occurredAt':'2026-10-05T10:00:00Z','expectedVersion':order['version'],'externalId':'REFUND-CI'},headers={'Idempotency-Key':'refund-once'},expected=201)
    assert refunded['order']['data']['refund_total']=='15.00'
    config={'provider':'openai-compatible','baseUrl':'http://localhost:8089/v1','model':'stub','apiKey':'cloud-only-test-key','monthlyBudget':'10','inputPrice':'1','outputPrice':'1','maxTokens':1000,'concurrency':2}
    call('/model-config',config,method='PUT')
    saved=call('/model-config');assert saved['hasKey'] and 'encryptedKey' not in saved
    inquiry=call('/records/inquiries?shopId='+shop['id'])['records'][0]
    ai=call('/analysis-runs',{'shopId':shop['id'],'kind':'reply','recordId':inquiry['id'],'useAi':True},expected=201)
    ai_report=wait_run(ai['id']);assert ai_report['state']=='completed' and ai_report['model']=='stub',ai_report
    assert call('/model-calls')[0]['cost']=='0.0005'
    actions=call('/action-drafts');assert any(a['kind']=='reply' and a['status']=='draft' for a in actions)
    config['model']='bad-evidence';config.pop('apiKey');call('/model-config',config,method='PUT')
    bad=call('/analysis-runs',{'shopId':shop['id'],'kind':'reply','recordId':inquiry['id'],'useAi':True},expected=201)
    bad_report=wait_run(bad['id']);assert bad_report['state']=='failed' and '证据' in bad_report['error'],bad_report
    config['model']='stub';config['monthlyBudget']='0';call('/model-config',config,method='PUT')
    over=call('/analysis-runs',{'shopId':shop['id'],'kind':'reply','recordId':inquiry['id'],'useAi':True},expected=201)
    assert wait_run(over['id'])['state']=='failed'
    config['monthlyBudget']='10';call('/model-config',config,method='PUT')
    print('PASS: intake, transactions, isolation, source gates, provider, encrypted keys, cost ledger, evidence rejection and budget')
if __name__=='__main__':main()
