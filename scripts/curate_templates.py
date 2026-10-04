"""Build inert, versioned template data from already downloaded licensed sources."""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
sources = json.loads((ROOT / 'third_party/sources.json').read_text(encoding='utf-8'))
commits = {s['name']: s['commit'] for s in sources}
prompts = json.loads((ROOT / 'third_party/ecommerce-knowledge/dist/prompts.json').read_text(encoding='utf-8'))
templates = []
for topic in ['customer-service', 'pricing', 'inventory', 'research', 'listing', 'advertising']:
    selected = [p for p in prompts if topic in p['source'] and p.get('language') == 'zh'][:2]
    for i, p in enumerate(selected):
        templates.append({'id':topic+'-'+str(i+1),'title':topic+' / '+pathlib.Path(p['source']).stem,'version':'1.0','kind':'text','source':'kangise/ecommerce-ai-skills','commit':commits['ecommerce-knowledge'],'source_path':p['source'],'license':'CC0-1.0','body':p['body'],'status':'reviewed_reference','limitations':['经营参考模板；平台规则必须按当前站点确认','模板只作为文本资料，不执行脚本或命令']})
# Original rewrites retain the useful workflow while dropping gateway links and unverified models.
templates += [
    {'id':'image-white','title':'商品白底主图','kind':'image','version':'1.0','source':'xianyu110/ecommerce-image-skills','commit':commits['ecommerce-images'],'license':'MIT','body':'使用用户提供的商品原图。保持商品形状、颜色、Logo、文字与数量；纯白背景，保持真实阴影。不得生成不存在的配件、认证或标签。规格由用户填写，生成后人工复核商品一致性。','status':'adapted','limitations':['尺寸和边缘白色比例由程序检查；商品外观一致性需人工确认']},
    {'id':'image-selling','title':'卖点图','kind':'image','version':'1.0','source':'xianyu110/ecommerce-image-skills','commit':commits['ecommerce-images'],'license':'MIT','body':'使用已确认的商品事实制作卖点图。保留商品原貌，只显示有资料支持的功能和规格。用户指定语言、尺寸及目标平台。未证实卖点留空。','status':'adapted','limitations':['不默认采用任何平台尺寸或占比要求']},
    {'id':'amazon-search','title':'广告搜索词报表分析','kind':'text','version':'1.0','source':'zach22-1999/amazon-skills','commit':commits['amazon-reports'],'license':'MIT','body':'先校验搜索词报表期间、币种、归因窗口和粒度。以词根及购买意图整理搜索词；计算花费、点击及归因收入。缺少归因数据时不给出 ACOS/ROAS。将保留、进一步观察、候选否定词写为待确认行动，标明样本不足。','status':'adapted','limitations':['未连接外部选品工具；只分析用户提供的报表']},
    {'id':'b2b-followup','title':'国际站询盘跟进','kind':'text','version':'1.0','source':'original','license':'Apache-2.0','body':'从已确认询盘提取用途、数量、规格、目的地与时间要求。缺少信息列为澄清问题。结合供应商已确认信息准备回复与报价说明。不得承诺未确认库存、证书、运输时效或付款条款。','status':'original','limitations':['阿里国际站参考项目许可证未确认，因此模板为原创实现']}
]
dest = ROOT / 'catalog/templates.json'
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(templates,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('curated', len(templates))
