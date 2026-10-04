/* Adapted from Nono (p-j-jx), MIT, pinned revision in third_party/sources.json.
 * Changed: configurable rule provenance, safe text exports, explicit limitations. */
import { z } from 'zod';
export const ruleSchema=z.object({version:z.string().min(1),platform:z.string().min(1),site:z.string().default('unspecified'),category:z.string().default('unspecified'),source:z.string().min(1),kind:z.enum(['platform_requirement','recommendation']),titleMin:z.number().int().min(0).default(0),titleMax:z.number().int().positive().default(200),descriptionMax:z.number().int().positive().default(5000),bulletMax:z.number().int().positive().default(500),requiredBullets:z.number().int().min(0).default(0),restrictedTerms:z.array(z.string()).default([])});
export type Listing={title:string;description:string;bullets?:string;keywords?:string};
export function checkListing(content:Listing,rules:z.infer<typeof ruleSchema>){
  const checks:Array<{field:string;level:string;message:string;value?:number;limit?:number}>=[];const titleLength=Array.from(content.title).length;
  checks.push({field:'title',level:titleLength>rules.titleMax?'fail':titleLength<rules.titleMin?'warn':'pass',message:'标题长度',value:titleLength,limit:rules.titleMax});
  checks.push({field:'description',level:content.description.length>rules.descriptionMax?'fail':'pass',message:'描述长度',value:content.description.length,limit:rules.descriptionMax});
  const bullets=(content.bullets??'').split('\n').map(s=>s.trim()).filter(Boolean);
  if(bullets.length<rules.requiredBullets)checks.push({field:'bullets',level:'warn',message:'卖点条数少于配置建议'});
  bullets.forEach((b,i)=>{if(b.length>rules.bulletMax)checks.push({field:`bullet:${i+1}`,level:'fail',message:'单条卖点超过配置长度'});});
  const text=[content.title,content.description,content.bullets??''].join('\n').toLowerCase();
  for(const term of rules.restrictedTerms)if(text.includes(term.toLowerCase()))checks.push({field:'terms',level:'warn',message:`需核查措辞：${term}`});
  return {rules,checks,score:Math.max(0,100-checks.filter(c=>c.level==='fail').length*20-checks.filter(c=>c.level==='warn').length*5),limitations:['评分表示文本检查结果，不是平台审核结果或销量预测','默认规则仅为运营建议；具体站点与类目要求由管理员确认']};
}
const STOP=new Set(['the','and','for','with','from','this','that','of','to','in','on','is','are','的','了','和','与','在','是']);
function keywords(text:string){return [...new Set(text.toLowerCase().split(/[\s,，、;；|·\-—()（）【】\[\]"']+/).map(s=>s.trim()).filter(s=>s.length>=2&&!STOP.has(s)))];}
export function compareListings(yours:Listing,competitor:Listing){
  const a=keywords(Object.values(yours).join(' ')),b=keywords(Object.values(competitor).join(' '));const aa=new Set(a),bb=new Set(b);
  return {keywordGap:{unique:a.filter(x=>!bb.has(x)),missing:b.filter(x=>!aa.has(x)),shared:a.filter(x=>bb.has(x))},titleAnalysis:{yourLength:yours.title.length,competitorLength:competitor.title.length},limitations:['仅比较用户提供的文本','关键词差异不能证明竞品销量、排名或需求；中文分词结果需人工核查']};
}
export function safeCell(value:string){const safe=/^[\s]*[=+\-@]/.test(value)?`'${value}`:value;return `"${safe.replace(/"/g,'""')}"`;}
export function exportContent(content:Listing,format:'csv'|'txt'){
  if(format==='txt')return [content.title,content.bullets??'',content.description].join('\n\n');
  return '\uFEFF'+['title','description','bullets','keywords'].map(safeCell).join(',')+'\r\n'+[content.title,content.description,content.bullets??'',content.keywords??''].map(safeCell).join(',')+'\r\n';
}
