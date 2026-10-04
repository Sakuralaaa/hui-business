"""Python 3 standard-library task-scoped uploader. Never confirms business imports."""
import argparse
import hashlib
import http.client
import json
import os
import pathlib
import ssl
import sys
import time
import urllib.parse

class UploadError(Exception):
    pass

class Client:
    def __init__(self, base, token):
        self.url = urllib.parse.urlsplit(base.rstrip('/'))
        if self.url.scheme not in ('https','http') or self.url.username or self.url.password or self.url.query or self.url.fragment:
            raise UploadError('Invalid API base URL')
        if self.url.scheme == 'http' and self.url.hostname not in ('localhost','127.0.0.1','api'):
            raise UploadError('HTTPS is required outside a local/cloud test environment')
        self.token = token

    def request(self, method, path, data=None, file=None):
        for attempt in range(3):
            connection = None
            try:
                cls = http.client.HTTPSConnection if self.url.scheme == 'https' else http.client.HTTPConnection
                connection = cls(self.url.hostname,self.url.port,timeout=180)
                headers = {'Authorization':'Bearer '+self.token}
                body = json.dumps(data).encode('utf-8') if data is not None else b''
                if file:
                    headers['Content-Length'] = str(file.stat().st_size)
                    headers['Content-Type'] = 'application/octet-stream'
                    connection.putrequest(method,self.url.path+path)
                    for key,value in headers.items(): connection.putheader(key,value)
                    connection.endheaders()
                    with file.open('rb') as stream:
                        while True:
                            chunk = stream.read(1024*1024)
                            if not chunk: break
                            connection.send(chunk)
                else:
                    headers['Content-Type'] = 'application/json'
                    connection.request(method,self.url.path+path,body,headers)
                response = connection.getresponse()
                raw = response.read(2*1024*1024)
                result = json.loads(raw or b'{}')
                if response.status >= 400:
                    if response.status in (401,403): raise UploadError('Upload grant expired, revoked or out of scope; obtain a fresh grant from the administrator')
                    if response.status in (429,502,503,504) and attempt < 2:
                        time.sleep(2**attempt); continue
                    raise UploadError(result.get('message','HTTP '+str(response.status)))
                return result
            except (OSError,http.client.HTTPException) as error:
                # Session creation is not blindly retried because the response may have been lost.
                if (method == 'POST' and path == '/intake/sessions') or attempt == 2:
                    raise UploadError('Network interrupted: '+type(error).__name__+'. For a lost creation response, start a new state file; never confirm automatically') from None
                time.sleep(2**attempt)
            finally:
                if connection: connection.close()
        raise UploadError('Upload retries exhausted')

def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while True:
            chunk = stream.read(1024*1024)
            if not chunk: break
            digest.update(chunk)
    return digest.hexdigest()

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-base',required=True)
    parser.add_argument('--manifest',required=True,type=pathlib.Path)
    parser.add_argument('--directory',required=True,type=pathlib.Path)
    parser.add_argument('--state',required=True,type=pathlib.Path)
    parser.add_argument('--no-poll',action='store_true')
    args=parser.parse_args(argv)
    token=os.environ.get('HUI_UPLOAD_TOKEN')
    if not token: raise UploadError('Set HUI_UPLOAD_TOKEN in the process environment; do not pass tokens in command arguments')
    root=args.directory.resolve();manifest=json.loads(args.manifest.read_text(encoding='utf-8-sig'))
    if manifest.get('contract_version') != '1.0': raise UploadError('Unsupported contract version')
    specs=manifest.get('files',[])
    if not 1 <= len(specs) <= 30: raise UploadError('Expected 1..30 files')
    paths={};total=0
    for spec in specs:
        name=spec['filename']
        if '/' in name or '\\' in name or name.startswith('.') or any(ord(c)<32 for c in name): raise UploadError('Invalid filename')
        path=(root/name).resolve()
        if path.parent != root or not path.is_file() or path.is_symlink(): raise UploadError('File must be a regular file inside export directory')
        size=path.stat().st_size
        if not 0<size<=100*1024*1024: raise UploadError('File exceeds 100 MiB or is empty')
        total+=size;spec['size']=size;spec['sha256']=sha(path)
        if name in paths: raise UploadError('Duplicate filename')
        paths[name]=path
    if total>300*1024*1024: raise UploadError('Batch exceeds 300 MiB')
    fingerprint=hashlib.sha256(json.dumps(manifest,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    client=Client(args.api_base,token)
    if args.state.exists():
        state=json.loads(args.state.read_text(encoding='utf-8'))
        if state['fingerprint']!=fingerprint or state['api_base']!=args.api_base: raise UploadError('State belongs to different files, manifest or server')
        session=client.request('GET','/intake/sessions/'+state['session']['id'])
    else:
        session=client.request('POST','/intake/sessions',manifest)
        state={'fingerprint':fingerprint,'api_base':args.api_base,'session':session}
        args.state.parent.mkdir(parents=True,exist_ok=True)
        temp=args.state.with_suffix('.tmp');temp.write_text(json.dumps(state,indent=2)+'\n',encoding='utf-8');temp.replace(args.state)
    if session['state'] in ('created','uploading'):
        for file in session['files']:
            if not file.get('uploaded'):
                print('Uploading '+file['filename'],flush=True)
                client.request('PUT','/intake/sessions/'+session['id']+'/files/'+file['id'],file=paths[file['filename']])
        session=client.request('POST','/intake/sessions/'+session['id']+'/complete',{})
    if not args.no_poll:
        for _ in range(20):
            session=client.request('GET','/intake/sessions/'+session['id'])
            if session['state'] not in ('uploaded','validating'): break
            time.sleep(3)
    print(json.dumps({'session_id':session['id'],'state':session['state'],'error':session.get('error'),'summary':session.get('summary'),'next':'Review and confirm in the web workbench'},ensure_ascii=False),flush=True)
    return 1 if session['state'] in ('failed','rejected') else 0

if __name__=='__main__':
    try: sys.exit(main())
    except (UploadError,ValueError,KeyError) as error:
        print('Upload failed: '+str(error),file=sys.stderr);sys.exit(1)
