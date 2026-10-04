import Decimal from 'decimal.js';
export type BusinessRow={id:string;dataset:string;data:Record<string,any>};
const D=(v:unknown)=>new Decimal(String(v??0));
const sum=(rows:BusinessRow[],key:string)=>rows.reduce((s,r)=>s.plus(D(r.data[key])),new Decimal(0));
const ratio=(n:Decimal,d:Decimal)=>d.isZero()?null:n.div(d).toFixed(6);
const before=(time:string,cutoff:string)=>Date.parse(time)<=Date.parse(cutoff);
export function calculateMetrics(rows:BusinessRow[],cutoff:string){
  const by=(d:string)=>rows.filter(r=>r.dataset===d);
  const orders=by('orders').filter(r=>r.data.status!=='canceled'&&before(r.data.ordered_at,cutoff));
  const currencies=[...new Set([...orders,...by('expenses'),...by('ads'),...by('payments')].map(r=>r.data.currency))];
  const groups=currencies.map(currency=>{
    const o=orders.filter(r=>r.data.currency===currency),e=by('expenses').filter(r=>r.data.currency===currency&&before(r.data.occurred_at,cutoff)&&r.data.allocation==='overhead');
    const missing=o.filter(r=>r.data.cost_total===undefined||r.data.fee_total===undefined||r.data.refund_total===undefined).map(r=>r.id);
    const refunds=o.reduce((s,r)=>r.data.refund_at&&!before(r.data.refund_at,cutoff)?s:s.plus(D(r.data.refund_total)),new Decimal(0));
    const revenue=sum(o,'total').minus(refunds);
    const confirmed=e.filter(r=>r.data.status==='confirmed');
    const ads=by('ads').filter(r=>r.data.currency===currency&&r.data.date<=cutoff.slice(0,10));
    const spend=sum(ads,'spend'),clicks=sum(ads,'clicks'),impressions=sum(ads,'impressions');
    const attributionReady=ads.length>0&&ads.every(r=>r.data.attributed_revenue!==undefined&&r.data.attribution_window);
    const attributed=sum(ads,'attributed_revenue');
    const p=by('payments').filter(r=>r.data.currency===currency&&before(r.data.occurred_at,cutoff));
    return {currency,order_count:o.length,revenue:revenue.toFixed(2),refunds:refunds.toFixed(2),known_order_cost:sum(o,'cost_total').toFixed(2),known_order_fees:sum(o,'fee_total').toFixed(2),confirmed_overhead:sum(confirmed,'amount').toFixed(2),estimated_overhead:sum(e.filter(r=>r.data.status==='estimated'),'amount').toFixed(2),contribution_profit:missing.length?null:revenue.minus(sum(o,'cost_total')).minus(sum(o,'fee_total')).minus(sum(confirmed,'amount')).toFixed(2),missing_cost_records:missing,cash_in:sum(p.filter(r=>r.data.direction==='in'),'amount').toFixed(2),cash_out:sum(p.filter(r=>r.data.direction==='out'),'amount').toFixed(2),refundable_security:sum(p.filter(r=>r.data.kind==='refundable_security'),'amount').toFixed(2),prepaid_balance:sum(p.filter(r=>r.data.kind==='prepaid_balance'),'amount').toFixed(2),ads:{spend:spend.toFixed(2),ctr:ratio(clicks,impressions),cpc:ratio(spend,clicks),acos:attributionReady?ratio(spend,attributed):null,roas:attributionReady?ratio(attributed,spend):null,attribution_ready:attributionReady}};
  });
  const inquiries=by('inquiries').filter(r=>before(r.data.received_at,cutoff));
  const linked=new Set(orders.filter(r=>r.data.inquiry_id).map(r=>r.data.inquiry_id));
  const replies=inquiries.filter(r=>r.data.first_reply_at&&before(r.data.first_reply_at,cutoff));
  const replyHours=replies.map(r=>Math.max(0,(Date.parse(r.data.first_reply_at)-Date.parse(r.data.received_at))/3600000));
  const inventory=by('inventory').filter(r=>r.data.ownership==='owned').map(r=>({record_id:r.id,product_id:r.data.product_id,warehouse:r.data.warehouse,available:D(r.data.quantity).minus(D(r.data.reserved)).toFixed(4),as_of:r.data.as_of}));
  return {version:'metrics-1.0',cutoff,currencies:groups,b2b:{inquiries:inquiries.length,unreplied:inquiries.length-replies.length,average_first_reply_hours:replyHours.length?replyHours.reduce((a,b)=>a+b,0)/replyHours.length:null,explicitly_linked_orders:linked.size,conversion_rate:null,conversion_limitation:'跨来源询盘与订单关系尚未确认；已关联计数不自动解释为完整转化率'},inventory,evidence_record_ids:rows.map(r=>r.id),limitations:['未进行币种合并；每日汇总未与订单明细重复累计','贡献利润仅在成本、费用与退款字段齐备时可计算','收付款反映资金流，单独记录且不重复加为收入','库存是已确认快照，不代表实时平台库存']};
}
export function sevenDayTrend(rows:BusinessRow[],cutoff:string,timezone:string){
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(cutoff));
  const anchor=Date.parse(date+'T00:00:00Z');const days=Array.from({length:14},(_,i)=>new Date(anchor-(14-i)*86400000).toISOString().slice(0,10));
  const currencies=[...new Set(rows.filter(r=>r.dataset==='daily').map(r=>r.data.currency))];
  return currencies.map(currency=>{
    const r=rows.filter(r=>r.dataset==='daily'&&r.data.currency===currency&&days.includes(r.data.date));const counts=new Map<string,number>();r.forEach(x=>counts.set(x.data.date,(counts.get(x.data.date)??0)+1));
    const missing=days.filter(d=>!counts.has(d)),ambiguous=days.filter(d=>(counts.get(d)??0)>1);const ready=!missing.length&&!ambiguous.length;
    const first=sum(r.filter(x=>days.slice(0,7).includes(x.data.date)),'sales'),second=sum(r.filter(x=>days.slice(7).includes(x.data.date)),'sales');
    return {currency,timezone,first_period:{start:days[0],end_exclusive:days[7]},second_period:{start:days[7],end_exclusive:date},ready,missing_dates:missing,ambiguous_dates:ambiguous,first_sales:ready?first.toFixed(2):null,second_sales:ready?second.toFixed(2):null,growth:ready?ratio(second.minus(first),first):null};
  });
}
export function quoteScenario(input:{quantity:string;unitCost:string;shipping:string;fees:string;targetMargin:string;exchangeRate:string}){
  const q=D(input.quantity),margin=D(input.targetMargin),fx=D(input.exchangeRate);
  if(q.lte(0)||margin.lt(0)||margin.gte(1)||fx.lte(0))throw Error('数量、汇率或毛利率无效');
  const cost=D(input.unitCost).mul(q).plus(D(input.shipping)).plus(D(input.fees)).mul(fx);
  return {totalCost:cost.toFixed(4),suggestedTotal:cost.div(new Decimal(1).minus(margin)).toFixed(4),suggestedUnit:cost.div(new Decimal(1).minus(margin)).div(q).toFixed(4),kind:'scenario',assumptions:input};
}
