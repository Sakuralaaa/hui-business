import Decimal from 'decimal.js';
export type BusinessRow={id:string;dataset:string;data:Record<string,any>};
const D=(v:unknown)=>new Decimal(String(v??0));
const sum=(rows:BusinessRow[],key:string)=>rows.reduce((s,r)=>s.plus(D(r.data[key])),new Decimal(0));
const ratio=(n:Decimal,d:Decimal)=>d.isZero()?null:n.div(d).toFixed(6);
export function calculateMetrics(rows:BusinessRow[],cutoff:string){
  const by=(d:string)=>rows.filter(r=>r.dataset===d);
  const orders=by('orders').filter(r=>r.data.status!=='canceled'&&r.data.ordered_at<=cutoff);
  const currencies=[...new Set([...orders,...by('expenses'),...by('ads'),...by('payments')].map(r=>r.data.currency))];
  const groups=currencies.map(currency=>{
    const o=orders.filter(r=>r.data.currency===currency),e=by('expenses').filter(r=>r.data.currency===currency&&r.data.occurred_at<=cutoff&&r.data.allocation==='overhead');
    const missing=o.filter(r=>r.data.cost_total===undefined||r.data.fee_total===undefined||r.data.refund_total===undefined).map(r=>r.id);
    const refunds=o.reduce((s,r)=>r.data.refund_at&&r.data.refund_at>cutoff?s:s.plus(D(r.data.refund_total)),new Decimal(0));
    const revenue=sum(o,'total').minus(refunds);
    const confirmed=e.filter(r=>r.data.status==='confirmed');
    const ads=by('ads').filter(r=>r.data.currency===currency&&r.data.date<=cutoff.slice(0,10));
    const spend=sum(ads,'spend'),clicks=sum(ads,'clicks'),impressions=sum(ads,'impressions');
    const attributionReady=ads.length>0&&ads.every(r=>r.data.attributed_revenue!==undefined&&r.data.attribution_window);
    const attributed=sum(ads,'attributed_revenue');
    const p=by('payments').filter(r=>r.data.currency===currency&&r.data.occurred_at<=cutoff);
    return {currency,order_count:o.length,revenue:revenue.toFixed(2),refunds:refunds.toFixed(2),known_order_cost:sum(o,'cost_total').toFixed(2),known_order_fees:sum(o,'fee_total').toFixed(2),confirmed_overhead:sum(confirmed,'amount').toFixed(2),estimated_overhead:sum(e.filter(r=>r.data.status==='estimated'),'amount').toFixed(2),contribution_profit:missing.length?null:revenue.minus(sum(o,'cost_total')).minus(sum(o,'fee_total')).minus(sum(confirmed,'amount')).toFixed(2),missing_cost_records:missing,cash_in:sum(p.filter(r=>r.data.direction==='in'),'amount').toFixed(2),cash_out:sum(p.filter(r=>r.data.direction==='out'),'amount').toFixed(2),refundable_security:sum(p.filter(r=>r.data.kind==='refundable_security'),'amount').toFixed(2),prepaid_balance:sum(p.filter(r=>r.data.kind==='prepaid_balance'),'amount').toFixed(2),ads:{spend:spend.toFixed(2),ctr:ratio(clicks,impressions),cpc:ratio(spend,clicks),acos:attributionReady?ratio(spend,attributed):null,roas:attributionReady?ratio(attributed,spend):null,attribution_ready:attributionReady}};
  });
  const inquiries=by('inquiries').filter(r=>r.data.received_at<=cutoff);
  const linked=new Set(orders.filter(r=>r.data.inquiry_id).map(r=>r.data.inquiry_id));
  const replies=inquiries.filter(r=>r.data.first_reply_at&&r.data.first_reply_at<=cutoff);
  const replyHours=replies.map(r=>Math.max(0,(Date.parse(r.data.first_reply_at)-Date.parse(r.data.received_at))/3600000));
  const inventory=by('inventory').filter(r=>r.data.ownership==='owned').map(r=>({record_id:r.id,product_id:r.data.product_id,warehouse:r.data.warehouse,available:D(r.data.quantity).minus(D(r.data.reserved)).toFixed(4),as_of:r.data.as_of}));
  return {version:'metrics-1.0',cutoff,currencies:groups,b2b:{inquiries:inquiries.length,unreplied:inquiries.length-replies.length,average_first_reply_hours:replyHours.length?replyHours.reduce((a,b)=>a+b,0)/replyHours.length:null,explicitly_linked_orders:linked.size,conversion_rate:null,conversion_limitation:'跨来源询盘与订单关系尚未确认；已关联计数不自动解释为完整转化率'},inventory,evidence_record_ids:rows.map(r=>r.id),limitations:['未进行币种合并；每日汇总未与订单明细重复累计','贡献利润仅在成本、费用与退款字段齐备时可计算','收付款反映资金流，单独记录且不重复加为收入','库存是已确认快照，不代表实时平台库存']};
}
export function quoteScenario(input:{quantity:string;unitCost:string;shipping:string;fees:string;targetMargin:string;exchangeRate:string}){
  const q=D(input.quantity),margin=D(input.targetMargin),fx=D(input.exchangeRate);
  if(q.lte(0)||margin.lt(0)||margin.gte(1)||fx.lte(0))throw Error('数量、汇率或毛利率无效');
  const cost=D(input.unitCost).mul(q).plus(D(input.shipping)).plus(D(input.fees)).mul(fx);
  return {totalCost:cost.toFixed(4),suggestedTotal:cost.div(new Decimal(1).minus(margin)).toFixed(4),suggestedUnit:cost.div(new Decimal(1).minus(margin)).div(q).toFixed(4),kind:'scenario',assumptions:input};
}
