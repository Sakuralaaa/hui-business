import {useEffect,useState} from 'react';
import {getEnterprise} from './api';
export function AssetImage({id,name}:{id:string;name:string}){
 const [url,setUrl]=useState('');
 useEffect(()=>{let active=true,blobUrl='';fetch('/api/v1/assets/'+id,{headers:{'X-Enterprise-Id':getEnterprise()},credentials:'same-origin'}).then(r=>{if(!r.ok)throw Error('图片不可访问');return r.blob();}).then(blob=>{if(active){blobUrl=URL.createObjectURL(blob);setUrl(blobUrl);}}).catch(()=>setUrl(''));return()=>{active=false;if(blobUrl)URL.revokeObjectURL(blobUrl);};},[id]);
 return url?<img className="asset-image" src={url} alt={name}/>:<div className="asset-image" style={{display:'grid',placeItems:'center'}}>加载图片…</div>;
}
