import {useState} from 'react';
import {App,Button,Card,Input} from 'antd';
import {api} from './api';
export function SourceRules({shop}:{shop:any}){
 const {message}=App.useApp();const [value,setValue]=useState(JSON.stringify(shop.capabilities?.sourceRules??{},null,2));
 return <Card title="计量主来源" style={{marginBottom:20}}><p className="section-note">同一个数据集存在多个来源时，综合指标暂停计算，避免把同一交易累计两次。核对后填写数据集与来源，例如 {JSON.stringify({orders:'alibaba_com',payments:'manual'})}。来源未指定时保留冲突。</p><Input.TextArea rows={4} value={value} onChange={e=>setValue(e.target.value)}/><Button style={{marginTop:12}} onClick={async()=>{try{await api('/shops/'+shop.id+'/source-rules',{method:'PATCH',body:JSON.stringify({rules:JSON.parse(value)})});message.success('规则已保存；新分析按此来源计算，旧报告保留原依据');}catch(e:any){message.error(e.message);}}}>确认并保存规则</Button></Card>;
}
