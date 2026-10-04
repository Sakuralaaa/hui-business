# 第三方来源与修改

精确提交、采用文件和 SHA-256 见 [third_party/sources.json](third_party/sources.json)。目录中的原始资料是开发依据，不会执行 Markdown 里的命令，不会将整个上游系统作为运行依赖。

| 来源 | 许可证 | 实际使用与改造 |
|---|---|---|
| p-j-jx/Nono | MIT © 2026 p-j-jx | packages/core/src/content.ts 改写文案检查、词汇差异和导出；规则来源与版本可配置，CSV 阻止公式执行，导出明确标注草稿；去掉固定配额 |
| lien0219/trademind-ai | Apache-2.0 | apps/api/src/business.ts 移植 AI 应用前的版本 / 来源快照检查和安全撤销流程；Provider 接口移为 TypeScript；未嵌入 Go 运行时 |
| kangise/ecommerce-ai-skills | CC0-1.0 | 筛选中文客服、价格、库存、选品等模板进入 catalog；保留来源路径和版本；不把经验提示当成平台官方政策 |
| xianyu110/ecommerce-image-skills | MIT © 2026 xianyu110 | 改写白底与卖点模板，删除固定网关、推广链接和模型断言；以 sharp 实现尺寸与边缘检查，外观一致性留人工复核 |
| zach22-1999/amazon-skills | MIT | 改写报表搜索词分析流程；数据完整性、归因收入与样本量门槛纳入模板；不默认依赖 Sorftime / SIF 等服务 |
| AccioWork/agent-skills | MIT-0 © 2025 acciowork | 参考技能组织，原创采集任务协议与上传程序；不将其描述为 Accio Work 全部源码 |

各 LICENSE 保存在对应 third_party 子目录。TradeMind 原代码与 Apache 许可一并保留；本项目移植代码有修改，不代表上游官方版本。

阿里国际站 Skills、Amazon Product Studio、OmniTradeERP、AgentHub 的代码与模板未复制；未确认许可证的项目仅参考业务思路。Vibe Seller 仅为后期浏览器执行组件的候选参考。Dify 未集成运行依赖；将来接入前另行确认其商业多工作区及品牌条款。awesome-amazon-ec-skills 仅作为发现目录。Ollama 保留 OpenAI 兼容接入方式，模型权重许可另行审查。
