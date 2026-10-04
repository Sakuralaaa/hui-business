"""Use existing Git credential manager auth; never print or persist credentials."""
import argparse
import io
import json
import pathlib
import subprocess
import urllib.request
import zipfile
import sys
import urllib.parse
if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8',errors='replace')

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        next_req=super().redirect_request(req,fp,code,msg,headers,newurl)
        if next_req and urllib.parse.urlsplit(newurl).hostname != 'api.github.com':
            next_req.remove_header('Authorization')
        return next_req

def credentials():
    proc=subprocess.run(['git','credential','fill'],input='protocol=https\nhost=github.com\n\n',text=True,capture_output=True,timeout=30)
    values=dict(line.split('=',1) for line in proc.stdout.splitlines() if '=' in line)
    return values.get('password')
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',type=int);parser.add_argument('--artifacts',action='store_true');parser.add_argument('--logs',action='store_true');args=parser.parse_args()
    token=credentials()
    if not token: print('GitHub API credential unavailable');return
    def get(path,raw=False):
        request=urllib.request.Request('https://api.github.com/repos/Sakuralaaa/hui-business'+path,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','User-Agent':'hui-business-ci'})
        with urllib.request.build_opener(SafeRedirect()).open(request,timeout=45) as response:
            return response.read() if raw else json.load(response)
    if args.run and args.logs:
        jobs=get('/actions/runs/'+str(args.run)+'/jobs')
        for job in jobs['jobs']:
            print(job['name'],job['conclusion'])
            if job['conclusion']=='failure':
                raw=get('/actions/jobs/'+str(job['id'])+'/logs',True).decode('utf-8',errors='replace')
                lines=raw.splitlines();indices=[i for i,line in enumerate(lines) if any(k in line for k in ['error TS','Error:','##[error]','FAIL','AssertionError','error:','Error validating'])];selected=set()
                for i in indices:
                    selected.update(range(max(0,i-3),min(len(lines),i+14)))
                print('\n'.join(lines[i] for i in sorted(selected)) if selected else '\n'.join(lines[-110:]))
    elif args.run and args.artifacts:
        artifacts=get('/actions/runs/'+str(args.run)+'/artifacts')['artifacts']
        for artifact in artifacts:
            content=get('/actions/artifacts/'+str(artifact['id'])+'/zip',True)
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                for name in archive.namelist():
                    if name=='0001_initial.sql':
                        target=pathlib.Path('apps/api/prisma/migrations/0001_initial.sql');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(name));print('Saved initial migration')
                    if name=='package-lock.json':pathlib.Path(name).write_bytes(archive.read(name));print('Saved cloud lockfile')
                    if name.endswith('.log'):print(name+'\n'+archive.read(name).decode('utf-8',errors='replace')[-10000:])
                    if name in ('dashboard.png','content-studio.png'):
                        target=pathlib.Path('docs/screenshots')/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(name));print('Saved '+name)
    else:
        runs=get('/actions/runs?per_page=5')['workflow_runs']
        for run in runs: print(json.dumps({k:run[k] for k in ['id','status','conclusion','head_sha','html_url']},ensure_ascii=False))
if __name__=='__main__':main()
