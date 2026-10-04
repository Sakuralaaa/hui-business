"""Create deidentified sample files for import review, without running application tests."""
import csv
import json
import pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]/'samples'
ROOT.mkdir(exist_ok=True)
headers=['external_id','channel','ordered_at','currency','total','refund_total','cost_total','fee_total','status','source_updated_at']
cases={
 'orders-original.csv':[['000001','retail','2026-09-30T10:00:00+08:00','USD','120.00','0','55','5','paid','2026-09-30T11:00:00+08:00'],['000002','b2b','2026-09-30T11:00:00+08:00','USD','500.00','0','','','partial','2026-09-30T12:00:00+08:00']],
 'orders-late-refund.csv':[['000001','retail','2026-09-30T10:00:00+08:00','USD','120.00','20','55','5','completed','2026-10-04T10:00:00+08:00']],
 'orders-old-version.csv':[['000001','retail','2026-09-30T10:00:00+08:00','USD','120.00','0','55','5','paid','2026-09-30T11:00:00+08:00']],
 'orders-conflict.csv':[['000001','retail','2026-09-30T10:00:00+08:00','USD','130.00','0','55','5','paid','']],
}
for filename,rows in cases.items():
 with (ROOT/filename).open('w',encoding='utf-8-sig',newline='') as f:
  writer=csv.writer(f);writer.writerow(headers);writer.writerows(rows)
with (ROOT/'daily-partial.csv').open('w',encoding='utf-8-sig',newline='') as f:
 writer=csv.writer(f);writer.writerow(['external_id','date','sales','currency','orders']);writer.writerows([['D-2026-09-28','2026-09-28','300','USD','3'],['D-2026-09-30','2026-09-30','200','USD','2']])
(ROOT/'README.md').write_text('''# 演示导入资料

这些文件全部为模拟数据，选择演示企业与 simulation 采集方式。

按顺序导入 orders-original、orders-late-refund、orders-old-version、orders-conflict：分别观察新记录、迟到退款更新、旧版忽略与无时间冲突。原件再次上传不会重复记收入。000002 缺成本，利润不可计算。daily-partial 缺日期，不补造趋势。

新任务指定 orders / daily 数据集，期望范围可留未知。逐批上传，预览后确认，冲突只在用户明确排除或更正后处理。编号 000001 保留前导零。
''',encoding='utf-8')
print('Sample files created')
