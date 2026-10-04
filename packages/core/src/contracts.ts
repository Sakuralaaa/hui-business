import { z } from 'zod';
export const DATASETS = ['products','customers','suppliers','inquiries','quotes','samples','orders','order_lines','purchases','inventory','payments','expenses','daily','ads','content','tasks','knowledge','reviews'] as const;
export type Dataset = typeof DATASETS[number];
export const datasetSchema = z.enum(DATASETS);
export const acquisitionSchema = z.enum(['native_export','official_api','page_extract','manual','ai_report','simulation']);
export const limits = {file:100*1024*1024,batch:300*1024*1024,files:30,expanded:1024*1024*1024,rows:200_000};
const timestamp = z.string().datetime({offset:true});
export const manifestFileSchema = z.object({
  filename:z.string().min(1).max(180).refine(s=>!/[\\/\x00-\x1f]/.test(s) && !s.startsWith('.'),'仅允许文件名'),
  dataset:datasetSchema, acquisition_method:acquisitionSchema,
  sha256:z.string().regex(/^[a-f0-9]{64}$/), size:z.number().int().min(1).max(limits.file),
  period_start:timestamp.nullable().default(null),period_end_exclusive:timestamp.nullable().default(null),
  source_timezone:z.string().max(80).nullable().default(null),source_expected_rows:z.number().int().min(0).nullable().default(null),
  completeness:z.enum(['complete','partial','unknown']).default('unknown'),limitations:z.array(z.string().max(500)).max(30).default([]),
  grain:z.enum(['record','order_line','shop_day','product_day','campaign_day','snapshot']).default('record'),
  value_semantics:z.enum(['event','period','cumulative','snapshot']).default('event'),
  original_filename:z.string().max(180).nullable().default(null)
}).superRefine((f,c)=>{if(f.period_start&&f.period_end_exclusive&&Date.parse(f.period_start)>=Date.parse(f.period_end_exclusive))c.addIssue({code:'custom',message:'时间范围结束必须晚于开始'});});
export const manifestSchema=z.object({contract_version:z.literal('1.0'),collection_request_id:z.string().uuid(),collector:z.string().min(1).max(80),source_platform:z.string().min(1).max(80),exported_at:timestamp,files:z.array(manifestFileSchema).min(1).max(limits.files)}).superRefine((m,c)=>{
  if(new Set(m.files.map(f=>f.filename)).size!==m.files.length)c.addIssue({code:'custom',message:'文件名重复'});
  if(m.files.reduce((s,f)=>s+f.size,0)>limits.batch)c.addIssue({code:'custom',message:'批次超过大小限制'});
});
export type Manifest=z.infer<typeof manifestSchema>;
export type FileSpec=z.infer<typeof manifestFileSchema>;
export const importStates=['created','uploading','uploaded','validating','needs_mapping','needs_review','ready_for_confirmation','committing','completed','rejected','failed','canceled'] as const;
export const mappingSchema=z.object({
  columns:z.record(z.string(),z.string().min(1)),timezone:z.string().nullable().default(null),
  date_format:z.enum(['iso','yyyy-MM-dd','yyyy-MM-dd HH:mm:ss']).default('iso'),
  constants:z.record(z.string(),z.string()).default({}),excluded_rows:z.array(z.string()).max(limits.rows).default([])
});
export type Mapping=z.infer<typeof mappingSchema>;
export const money=z.string().regex(/^\d{1,24}(\.\d{1,8})?$/,'金额或数量必须为非负十进制字符串');
const id=z.string().min(1).max(180);
const optionalMoney=money.optional();
const base={external_id:id,source_updated_at:timestamp.optional()};
export const fields:Record<Dataset,Record<string,z.ZodTypeAny>>={
  products:{...base,name:id,sku:id,description:z.string().optional(),unit:id,currency:z.string().regex(/^[A-Z]{3}$/),cost:optionalMoney,price:optionalMoney,supplier_id:id.optional(),attributes:z.string().optional()},
  customers:{...base,name:id,email:z.string().email().optional(),country:id.optional()},
  suppliers:{...base,name:id,email:z.string().email().optional(),lead_days:money.optional()},
  inquiries:{...base,customer_id:id,received_at:timestamp,status:z.enum(['new','contacted','quoted','sample','won','lost']),first_reply_at:timestamp.optional(),requirements:z.string().optional(),owner_id:id.optional()},
  quotes:{...base,inquiry_id:id,product_id:id,quantity:money,unit:id,unit_price:money,currency:z.string().regex(/^[A-Z]{3}$/),valid_until:timestamp,incoterm:id,lead_days:money,notes:z.string().optional()},
  samples:{...base,inquiry_id:id,product_id:id,status:z.enum(['requested','sent','received','approved','rejected']),sent_at:timestamp.optional(),fee:optionalMoney,currency:z.string().regex(/^[A-Z]{3}$/).optional()},
  orders:{...base,customer_id:id.optional(),inquiry_id:id.optional(),channel:z.enum(['b2b','retail']),ordered_at:timestamp,paid_at:timestamp.optional(),shipped_at:timestamp.optional(),currency:z.string().regex(/^[A-Z]{3}$/),total:money,refund_total:optionalMoney,cost_total:optionalMoney,fee_total:optionalMoney,status:z.enum(['draft','paid','partial','shipped','completed','canceled']),refund_at:timestamp.optional()},
  order_lines:{...base,order_id:id,product_id:id,sku:id,quantity:money,unit:id,unit_price:money,currency:z.string().regex(/^[A-Z]{3}$/)},
  purchases:{...base,supplier_id:id,product_id:id,quantity:money,received_quantity:money,unit:id,unit_price:money,currency:z.string().regex(/^[A-Z]{3}$/),status:z.enum(['draft','ordered','partial','received','canceled']),due_at:timestamp.optional()},
  inventory:{...base,product_id:id,warehouse:id,quantity:money,reserved:money,unit:id,as_of:timestamp,ownership:z.enum(['owned','supplier_claim']).default('owned')},
  payments:{...base,order_id:id.optional(),purchase_id:id.optional(),occurred_at:timestamp,amount:money,currency:z.string().regex(/^[A-Z]{3}$/),direction:z.enum(['in','out']),kind:z.enum(['deposit','balance','refund','supplier','refundable_security','prepaid_balance'])},
  expenses:{...base,order_id:id.optional(),occurred_at:timestamp,amount:money,currency:z.string().regex(/^[A-Z]{3}$/),category:id,status:z.enum(['estimated','confirmed']),allocation:z.enum(['included_order','overhead']).default('overhead')},
  daily:{...base,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),sales:money,currency:z.string().regex(/^[A-Z]{3}$/),orders:money,impressions:optionalMoney,clicks:optionalMoney},
  ads:{...base,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),campaign:id,spend:money,currency:z.string().regex(/^[A-Z]{3}$/),clicks:money,impressions:money,attributed_revenue:optionalMoney,attribution_window:id.optional(),search_term:z.string().optional()},
  content:{...base,product_id:id,platform:id,title:id,description:z.string(),bullets:z.string().optional(),status:z.enum(['draft','approved','published'])},
  tasks:{...base,title:id,status:z.enum(['todo','doing','done']),due_at:timestamp.optional(),owner_id:id.optional(),notes:z.string().optional()},
  knowledge:{...base,title:id,body:z.string().min(1).max(100_000),kind:z.enum(['policy','product','reference','ai_report']),valid_until:timestamp.optional()},
  reviews:{...base,product_id:id,body:z.string().min(1),rating:z.string().optional(),received_at:timestamp.optional()}
};
export const labels:Record<Dataset,string>={products:'商品',customers:'客户',suppliers:'供应商',inquiries:'B2B 询盘',quotes:'报价',samples:'样品',orders:'订单',order_lines:'订单明细',purchases:'采购',inventory:'库存快照',payments:'收付款',expenses:'费用',daily:'经营日报',ads:'广告报表',content:'渠道内容',tasks:'待办任务',knowledge:'知识资料',reviews:'评论'};
export function recordSchema(dataset:Dataset){return z.object(fields[dataset]).strict();}
export function requiredFields(dataset:Dataset){return Object.entries(fields[dataset]).filter(([,v])=>!v.isOptional()&&!v.isNullable()&&!(v instanceof z.ZodDefault)).map(([k])=>k);}
export const collectionSchema=z.object({shopId:z.string().uuid(),datasets:z.array(datasetSchema).min(1),periodStart:timestamp.nullable(),periodEnd:timestamp.nullable(),timezone:z.string().nullable(),requiredFields:z.array(z.string()).default([]),allowedMethods:z.array(acquisitionSchema).min(1),notes:z.string().max(2000).default('')});
