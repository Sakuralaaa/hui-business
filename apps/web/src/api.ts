export const getEnterprise=()=>localStorage.getItem('workbench-enterprise')??'';
let expiredHandler:(()=>void)|undefined;
let expiryHandled=false;
export function setSessionExpiredHandler(handler:()=>void){expiredHandler=handler;return()=>{if(expiredHandler===handler)expiredHandler=undefined;};}
export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers);headers.set('X-Enterprise-Id',getEnterprise());if(options.body&&typeof options.body==='string')headers.set('Content-Type','application/json');
  const response=await fetch(`/api/v1${path}`,{...options,headers,credentials:'same-origin'});
  const body=await response.json().catch(()=>({message:'服务暂不可用'}));
  if(!response.ok){
    if(response.status===401&&body.code==='AUTH'&&!path.startsWith('/auth/login')){if(!expiryHandled){expiryHandled=true;expiredHandler?.();}}
    const messages:Record<string,string>={AUTH:'登录已过期，请重新登录',TENANT:'当前账号无法访问所选企业',SHOP_SCOPE:'当前账号无法访问这家店铺',FORBIDDEN:'当前账号没有完成此操作的权限',VALIDATION:'有些内容格式不正确，请检查标红的字段',PREVIEW_STALE:'资料已变化，请刷新后重新核对',REVIEW:'还有问题未处理，请先检查或明确排除',VERSION_CONFLICT:'资料已被其他人更新，请刷新后再修改',MODEL_KEY:'请先由管理员配置 AI 模型',MODEL_BUDGET:'本月 AI 预算不足',MODEL_HOST:'模型地址需要由管理员加入允许列表'};
    const message=messages[body.code]??body.message??'操作没有完成，请检查后重试';
    throw Object.assign(new Error(message),{status:response.status,code:body.code});
  }
  if(path==='/auth/me'||path==='/auth/login')expiryHandled=false;
  return body as T;
}
export const post=(path:string,body:unknown)=>api(path,{method:'POST',body:JSON.stringify(body)});
export function download(name:string,text:string,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
export async function downloadFile(path:string,name:string){const response=await fetch(`/api/v1${path}`,{credentials:'same-origin',headers:{'X-Enterprise-Id':getEnterprise()}});if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.message??'下载失败，请检查资料权限');}const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function sha256(file:File){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(n=>n.toString(16).padStart(2,'0')).join('');}
