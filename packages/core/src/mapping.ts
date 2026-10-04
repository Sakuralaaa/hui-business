import { createHash } from 'node:crypto';
import { Dataset, Mapping, recordSchema,fields } from './contracts';
export const aliases:Record<string,string[]>={external_id:['id','编号','订单号','商品ID','询盘ID','外部ID'],source_updated_at:['更新时间','updated_at'],name:['名称','商品名称','客户名称'],sku:['SKU','货号'],unit:['单位'],currency:['币种','currency_code'],total:['订单金额','整单金额'],refund_total:['累计退款'],cost_total:['订单成本'],fee_total:['订单费用'],ordered_at:['下单时间'],paid_at:['支付时间'],customer_id:['客户ID'],product_id:['商品编号'],quantity:['数量'],unit_price:['单价'],received_at:['询盘时间'],first_reply_at:['首次回复时间'],status:['状态'],date:['日期'],sales:['销售额'],orders:['订单数'],spend:['花费'],clicks:['点击'],impressions:['曝光'],attributed_revenue:['广告归因收入'],occurred_at:['发生时间'],amount:['金额'],warehouse:['仓库'],as_of:['快照时间'],reserved:['预占数量']};
export function suggestMapping(columns:string[],dataset:Dataset):Mapping {
  const shape=fields[dataset];
  return {columns:Object.fromEntries(columns.flatMap(c=>{const k=Object.keys(shape).find(k=>k===c||aliases[k]?.includes(c));return k?[[c,k]]:[];})),constants:{},timezone:null,date_format:'iso',excluded_rows:[]};
}
export function normalizeRow(raw:Record<string,unknown>,mapping:Mapping,dataset:Dataset){
  const output:Record<string,unknown>={...mapping.constants};const errors:string[]=[];
  for(const [col,key] of Object.entries(mapping.columns)){
    const val=raw[col];if(val===null||val===undefined||val==='')continue;
    if(typeof val==='number'&&(!Number.isSafeInteger(val))&&(key==='external_id'||key.endsWith('_id')||key==='sku'))errors.push(`${col}: 数字标识可能已损失精度，请提供文本标识`);
    if(typeof val==='object'){errors.push(`${col}: 不支持复杂单元格或公式`);continue;}
    let str=String(val).trim();
    if((key.endsWith('_at')||key==='valid_until')&& !/T.*(Z|[+-]\d\d:\d\d)$/.test(str)){
      // No guessing of DST offsets. Non-ISO local dates currently only support explicit Asia/Shanghai or UTC.
      const match=/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?$/.exec(str);
      if(match&&['Asia/Shanghai','UTC'].includes(mapping.timezone??''))str=`${match[1]}T${match[2]??'00:00:00'}${mapping.timezone==='UTC'?'Z':'+08:00'}`;
      else errors.push(`${col}: 需要含时区的 ISO 时间，或明确支持的来源时区`);
    }
    output[key]=str;
  }
  const parsed=recordSchema(dataset).safeParse(output);
  if(!parsed.success)errors.push(...parsed.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`));
  return {data:parsed.success?parsed.data:null,errors};
}
export function stableJson(value:unknown):string {if(Array.isArray(value))return `[${value.map(stableJson).join(',')}]`;if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;return JSON.stringify(value)??'null';}
export function hash(value:unknown){return createHash('sha256').update(stableJson(value)).digest('hex');}
export function classifyChange(current:{data:unknown;sourceUpdatedAt:Date|null}|null,incoming:Record<string,unknown>){
  if(!current)return 'new' as const;
  if(hash(current.data)===hash(incoming))return 'duplicate' as const;
  const next=typeof incoming.source_updated_at==='string'?new Date(incoming.source_updated_at):null;
  if(next&&current.sourceUpdatedAt){if(next<current.sourceUpdatedAt)return 'stale' as const;if(next>current.sourceUpdatedAt)return 'update' as const;}
  return 'conflict' as const;
}
