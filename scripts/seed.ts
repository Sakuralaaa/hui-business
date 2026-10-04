import { PrismaClient } from '@prisma/client';
import { randomBytes,scryptSync } from 'node:crypto';
function passwordHash(password:string){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
const db=new PrismaClient({datasourceUrl:process.env.DATABASE_URL_ADMIN??process.env.DATABASE_URL});
async function main(){
  const email=process.env.BOOTSTRAP_EMAIL,password=process.env.BOOTSTRAP_PASSWORD;if(!email||!password||password.length<12)throw Error('设置 BOOTSTRAP_EMAIL 与至少 12 位的 BOOTSTRAP_PASSWORD');
  const user=await db.user.upsert({where:{email},create:{email,name:'经营负责人',passwordHash:passwordHash(password)},update:{}});
  if(await db.membership.count({where:{userId:user.id}})){console.log('Bootstrap user already initialized; no records reset');return;}
  const real=await db.enterprise.create({data:{name:'我的企业',mode:'real'}});await db.membership.create({data:{enterpriseId:real.id,userId:user.id,role:'owner',shopIds:[]}});
  for(const [index,name] of ['演示 · 海川工贸','演示 · 独立零售'].entries()){
    const ent=await db.enterprise.create({data:{name,mode:'demo'}});const shop=await db.shop.create({data:{enterpriseId:ent.id,name:index===0?'阿里国际站演示店':'零售演示店',platform:index===0?'alibaba_com':'shopify',capabilities:{fileImport:true,accio:'unverified',apiRead:false,apiWrite:false}}});await db.membership.create({data:{enterpriseId:ent.id,userId:user.id,role:'owner',shopIds:[shop.id]}});
    const insert=async(dataset:string,data:any)=>{const r=await db.businessRecord.create({data:{enterpriseId:ent.id,shopId:shop.id,dataset,sourcePlatform:'simulation',externalId:data.external_id,data}});await db.recordVersion.create({data:{enterpriseId:ent.id,shopId:shop.id,recordId:r.id,version:1,data,reason:'simulation-seed'}});return r;};
    await insert('suppliers',{external_id:'SUP-001',name:'演示供应商',email:'supplier@example.invalid',lead_days:'12'});
    for(const [sku,title,price,cost] of [['BOTTLE-01','不锈钢保温杯','12.50','5.20'],['BAG-02','便携旅行收纳包','18.00','8.00'],['LAMP-03','桌面阅读灯','26.00','11.50']]){
      await insert('products',{external_id:sku,name:title,sku,unit:'piece',currency:'USD',price,cost,supplier_id:'SUP-001',description:'演示商品，规格等待确认'});
      await insert('inventory',{external_id:'INV-'+sku,product_id:sku,warehouse:'自有仓',quantity:'120',reserved:'20',unit:'piece',as_of:'2026-10-04T00:00:00+08:00',ownership:'owned'});
      await insert('content',{external_id:'CONTENT-'+sku,product_id:sku,platform:index===0?'alibaba_com':'shopify',title:title,description:'根据已确认资料准备的渠道内容。其他规格待补充。',bullets:'可询价\n可确认包装方案',status:'draft'});
    }
    await insert('customers',{external_id:'C-001',name:'示例采购客户',email:'buyer@example.invalid',country:'DE'});
    for(let day=20;day<=30;day++){
      const date=`2026-09-${day}`;const total=(day%3+1)*120;
      await insert('orders',{external_id:`O-${day}`,customer_id:'C-001',channel:index===0?'b2b':'retail',ordered_at:date+'T10:00:00+08:00',paid_at:date+'T11:00:00+08:00',currency:'USD',total:String(total),refund_total:day===25?'24':'0',...(day!==28?{cost_total:String(total*0.45),fee_total:'8'}:{}),status:day===30?'partial':'completed',...(day===25?{refund_at:'2026-10-02T11:00:00+08:00'}:{})});
      await insert('order_lines',{external_id:`OL-${day}-1`,order_id:`O-${day}`,product_id:'BOTTLE-01',sku:'BOTTLE-01',quantity:'10',unit:'piece',unit_price:'12',currency:'USD'});
      await insert('daily',{external_id:'DAY-'+date,date,sales:String(total),orders:'1',currency:'USD',impressions:'800',clicks:'40'});
      await insert('ads',{external_id:'AD-'+date,date,campaign:'秋季演示推广',spend:'18',currency:'USD',clicks:'35',impressions:'900',...(day!==27?{attributed_revenue:'120',attribution_window:'7-day-click'}:{}),search_term:'insulated travel bottle'});
    }
    const inquiry=await insert('inquiries',{external_id:'INQ-001',customer_id:'C-001',received_at:'2026-09-20T09:00:00+08:00',first_reply_at:'2026-09-20T11:00:00+08:00',status:'quoted',requirements:'需要 500 个保温杯，包装与交期待确认'});
    await insert('inquiries',{external_id:'INQ-002',customer_id:'C-001',received_at:'2026-09-29T09:00:00+08:00',status:'new',requirements:'询问样品和 MOQ'});
    await insert('quotes',{external_id:'Q-001',inquiry_id:'INQ-001',product_id:'BOTTLE-01',quantity:'500',unit:'piece',unit_price:'7.80',currency:'USD',valid_until:'2026-10-15T00:00:00+08:00',incoterm:'EXW',lead_days:'14',notes:'阶梯报价需进一步确认'});
    await insert('samples',{external_id:'SAMPLE-001',inquiry_id:'INQ-001',product_id:'BOTTLE-01',status:'sent',sent_at:'2026-09-25T00:00:00+08:00',fee:'20',currency:'USD'});
    await insert('purchases',{external_id:'PO-001',supplier_id:'SUP-001',product_id:'BOTTLE-01',quantity:'300',received_quantity:'100',unit:'piece',unit_price:'5.2',currency:'USD',status:'partial',due_at:'2026-10-10T00:00:00+08:00'});
    await insert('payments',{external_id:'PAY-001',order_id:'O-30',occurred_at:'2026-09-30T11:00:00+08:00',amount:'120',currency:'USD',direction:'in',kind:'deposit'});
    await insert('expenses',{external_id:'EXP-001',occurred_at:'2026-09-30T00:00:00+08:00',amount:'35',currency:'USD',category:'包装服务',status:'estimated',allocation:'overhead'});
    await insert('knowledge',{external_id:'KN-001',title:'演示报价规则',body:'包装、规格与证书需要供应商书面确认。报价按币种和贸易术语分别记录。',kind:'policy'});
    await insert('tasks',{external_id:'TASK-001',title:'补充 O-28 订单成本与手续费',status:'todo',due_at:'2026-10-07T00:00:00+08:00',notes:'未补成本时，贡献利润显示不可计算'});
    await db.actionDraft.create({data:{enterpriseId:ent.id,shopId:shop.id,kind:'followup',recordId:inquiry.id,baseVersion:1,payload:{title:'确认采购客户包装要求',body:'请确认目标包装、目的地及希望收到样品的日期。'},evidence:{recordIds:[inquiry.id]},status:'draft'}});
  }
  console.log('Initialized real enterprise + two isolated demo enterprises');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.$disconnect());
