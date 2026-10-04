export const getEnterprise=()=>localStorage.getItem('workbench-enterprise')??'';
export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers);headers.set('X-Enterprise-Id',getEnterprise());if(options.body&&typeof options.body==='string')headers.set('Content-Type','application/json');
  const response=await fetch(`/api/v1${path}`,{...options,headers,credentials:'same-origin'});
  const body=await response.json().catch(()=>({message:'服务暂不可用'}));if(!response.ok)throw Error(body.message??`请求失败 ${response.status}`);return body as T;
}
export const post=(path:string,body:unknown)=>api(path,{method:'POST',body:JSON.stringify(body)});
export function download(name:string,text:string,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
export async function sha256(file:File){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(n=>n.toString(16).padStart(2,'0')).join('');}
