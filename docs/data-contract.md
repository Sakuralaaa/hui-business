# 接收协议与计算口径

OpenAPI 页面为 `/api/docs`，JSON 为 `/api/docs-json`。业务 API 前缀 `/api/v1`；登录使用 HttpOnly Cookie，企业由 X-Enterprise-Id 指定并由成员身份核验。上传端仅使用任务 Bearer 凭据。

Manifest 1.0 结构与枚举见 packages/core/src/contracts.ts，样例见 bridge/accio-bridge/references/manifest.example.json。上传程序计算 size / sha256；API 验证任务、店铺、平台、数据集与允许方法，上传中凭据失效时拒绝封存。

原件不可变 → StagingRow 原值及位置 → BusinessRecord 当前视图与 RecordVersion → DatasetSnapshot → AnalysisRun。修改映射会废止 previewHash；确认必须带 previewVersion、previewHash 和 Idempotency-Key。确认在单事务中完成，失败回滚；解析按千行写入，失败可以重新解析原件。首版大批次确认使用长事务，并未宣称已经验证十万行提交吞吐。

外部标识按 enterprise / shop / dataset / sourcePlatform / externalId 去重。来源更新时间较旧则 stale；缺少时间或相同时间但内容不一致则 conflict。不同来源相同编号不自动合并，由 EntityLink 确认关联。一个批次内部相同 ID 内容一致标 batch_duplicate，不同则 batch_conflict。缺行不解释为删除，未知不补零。

CSV 支持 UTF-8 与带 BOM 的 UTF-16LE；旧编码请明确转换。XLSX 每文件只接收一张工作表，公式及复杂值进入错误行，不执行宏或外链。ZIP 根目录最多 30 个 CSV / XLSX / JSON / JSONL，解压每文件 100 MiB、总量 1 GiB；不接受目录、符号链接和嵌套归档。同 ZIP 内所有文件使用该清单项的数据集与范围，混合数据集应分别直接上传。

时间字段使用含偏移的 ISO 时间。无偏移值仅在映射明确指定 UTC / Asia/Shanghai 时支持转换；其他时区要求采集端提供带偏移时间，避免猜测夏令时。

金额 / 数量是十进制字符串；每交易携带币种。首版按币种分别计算，不做默认换汇。汇率与利润情景以用户输入为依据，quote-scenarios 的 targetMargin 范围是 0≤m<1，exchangeRate 是由成本币种换为目标报价币种的倍率。

订单净额 = 非取消订单 total − 截止日已知累计退款；仅计算订单头，不叠加明细与日报。贡献利润 = 订单净额 − cost_total − fee_total − 已确认 overhead；任何订单缺少成本、费用或累计退款则显示不可算。included_order 费用不重复扣除。估算 overhead 单独展示。模型不会改变计算结果。

收付款仅表示现金流，不重复作为订单收入。refundable_security 与 prepaid_balance 另列，不能被当作实际成本。首版应收与应付需要订单、采购与收付款明确关联；跨来源关系不完备时不输出完整回款率。

广告 CTR=clicks/impressions、CPC=spend/clicks；ACOS=spend/attributed_revenue、ROAS=attributed_revenue/spend；零分母为 null。缺少归因收入或窗口不计算 ACOS/ROAS。不同币种、不同报表粒度不合并。

AI 接收指标与最多 30 条相关样例，隐藏 email / phone / address。证据引用必须来自实际提供的 ID；事实结论必须有证据。正文中的数字仍需核查，关键指标始终由程序结果展示。未配置模型时只进行确定性分析。知识模板视为静态资料，不执行其中的工具命令。
