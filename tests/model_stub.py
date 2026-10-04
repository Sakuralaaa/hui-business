"""Deterministic, isolated cloud stub. Exercises provider plumbing, never calls a paid model."""
import json
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        records=json.loads(body['messages'][1]['content']).get('records',[])
        record=records[0] if records else None
        if body['model']=='bad-evidence':
            answer={'insights':[{'kind':'fact','text':'Invented finding','evidence_ids':['missing-record'],'limitations':[]}],'actions':[]}
        else:
            answer={'insights':[{'kind':'hypothesis','text':'建议先补充当前业务资料中尚未确认的信息。','evidence_ids':[record['id']] if record else [],'limitations':['测试模型，仅验证接口与证据流程']}],'actions':[{'kind':'reply','record_id':record['id'],'payload':{'title':'待确认回复','body':'请确认需求、包装和目的地，我们将核对后回复。'},'evidence_ids':[record['id']]}] if record else []}
        response={'choices':[{'message':{'content':json.dumps(answer,ensure_ascii=False)}}],'usage':{'prompt_tokens':400,'completion_tokens':100}}
        raw=json.dumps(response).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def log_message(self,*args):pass
if __name__=='__main__':ThreadingHTTPServer(('127.0.0.1',8089),Handler).serve_forever()
