# 服务器部署与升级

全部构建、测试与镜像操作在 GitHub Actions 或服务器运行。本机仅编辑文件和查看结果。

1. GitHub 仓库 → Actions，确认 Validate and publish 成功。镜像分别为 `ghcr.io/sakuralaaa/hui-business-api:<commit>` 与 `...-web:<commit>`。服务器优先固定提交标签，避免升级时混用版本。
2. 将 compose.yaml、deploy/ 和 .env.example 放到服务器；复制 .env.example 为 .env。管理员、API、Worker 的数据库密码分别生成，只用 URL 安全字符。ENCRYPTION_KEY 是 32 字节随机密钥的 64 位十六进制表示。
3. 如 GHCR 包需要鉴权，服务器用具有 read:packages 的凭据登录 ghcr.io；凭据不写入代码或 compose 文件。
4. 在服务器执行 `docker compose pull`，然后 `docker compose --profile bootstrap up -d`。migrate 完成数据库初始化与行级策略，seed 初始化真实企业、两个演示企业与管理员。seed 发现已初始化的成员时不会重置业务。
5. HTTPS 反向代理指向 127.0.0.1:8080；PUBLIC_URL 必须与浏览器实际 origin 一致。生产 COOKIE_SECURE=true。只对外开放 HTTPS；数据库、API、Worker 无直接公网端口。
6. 登录管理员，检查两个演示企业隔离；真实企业新增店铺，再创建采集任务。

初期建议服务器 4 核 / 8GB；图片与模型使用外部服务。该规格是验收起点，非已测性能保证。S3 配置可加到 API 与 Worker 环境中：S3_BUCKET、S3_REGION、S3_ENDPOINT、AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY；凭据由部署配置管理，采集端不持有。

自定义模型的 host:port 加入 MODEL_HOST_ALLOWLIST。OpenAI 兼容 baseUrl 填到 /v1 层级，不填写 /chat/completions。本地 Ollama 仅在服务器明确启用 ALLOW_LOCAL_MODEL_HTTP=true 并限制允许的地址后使用。

## 升级

升级前备份数据库、附件和加密密钥，记录当前镜像标签。初始 schema 已登记哈希；schema 发生变化时程序拒绝自动升级，必须审查并提供对应迁移。禁止在真实数据库直接 db push。

## 备份与恢复

在服务器每日执行 `docker compose exec -T db pg_dump -U workbench_admin -d workbench -Fc > backups/workbench.dump`。备份 objects 卷或 S3 对象，保存单独的 ENCRYPTION_KEY。备份包含客户与经营资料，存储访问范围与企业数据一致。

恢复必须先在隔离实例演练：启动同版本空数据库，使用 pg_restore 恢复，挂载附件，恢复相同密钥，然后启动 API / Worker。抽查商品、原件下载、导入批次、报告快照与模型配置。不要在运行中的真实实例覆盖恢复。

日志可用 `docker compose logs api worker migrate` 查看；不会输出模型密钥或上传凭据。关注 ImportBatch 的 rejected / failed、WorkItem 的 failed、ModelCall 的 failed_unknown_cost。首版失败任务由管理员检查原因后重新创建或调整映射；尚未提供通用自动重跑按钮。
