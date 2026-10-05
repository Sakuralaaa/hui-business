# Zeabur 两个服务部署记录

2026-10-05 已将工作台合并为主应用 + PostgreSQL：[打开工作台](https://hui-business-sakuralaaa.zeabur.app)。仍运行在原来的唯一 ARM64 托管服务器，公网域名、管理员账号、企业数据和模型加密密钥均沿用。

管理员资料位于本机 data/zeabur-login.txt，已排除 Git 并限制文件访问。Zeabur API Key 和所有生成的密码不进入仓库。

## 当前服务

| 服务 | ID | 职责及持久化 |
|---|---|---|
| hui-business | 6ac28fa30bdfb9653793d1bb | 网页、API、Worker、每日备份；application 卷挂载 /data |
| postgresql | 6ac28bf60bdfb9653793d03e | PostgreSQL 18；沿用原数据库卷，无公网 TCP 转发 |

主应用镜像固定为 ghcr.io/sakuralaaa/hui-business-api:49afcbc35a2062380dfbb4c22a098f02c3b211f4。[GitHub Actions 37262680392](https://github.com/Sakuralaaa/hui-business/actions/runs/37262680392) 已完成 AMD64 / ARM64 构建、启动、Worker 故障恢复、容器重启和备份恢复检查。本机未进行构建或测试。

镜像沿用 API 包名，已包含网页。supervisord 管理内部独立进程，API、Worker、Nginx、备份以 node 用户运行。API 与 Worker 继续使用不同数据库角色；备份使用只读且可读取 RLS 数据的专用角色。主应用只对外提供 8080 HTTP，由 Zeabur 终止 HTTPS。

/api/health 同时检查数据库和 Worker 调度心跳。每日备份状态单独保存在 /data/backups/status.json，不能仅凭服务 Running 判断备份成功。

## 已完成的迁移与验证

- 沿用现有数据库，迁移前基准为 3 个企业、129 条业务记录、2 份原件。
- RustFS 的全部 2 个对象迁移至 /data/objects，逐个核对数据库记录中的 SHA-256；不存在来源缺失或目的文件冲突。
- 云端实际验收新增 1 份模拟原件；目前 3 份原件全部通过重启后的哈希校验与备份校验。
- HTTPS、登录、任务上传凭据、解析预览、幂等确认、原件下载、跨企业拒绝读取、后台分析和凭据撤销均通过。
- 本次验收批次：a29555fd-ab99-42b6-8e0f-993daf05ffea；分析报告：8ca42ee0-0619-4b2f-9cb3-8bd8d9cb908e。
- 旧数据库和原件备份已保存到 /data/backups/legacy/database-backup 与 /data/backups/legacy/originals-backup，并另存于本机受保护且不提交 Git 的 data/legacy-backups/。
- 移除临时 S3 迁移凭据、停用旧文件存储及独立备份服务后，主应用重启成功；不依赖 RustFS。
- 合并后的数据库归档恢复到隔离临时库，验证得到 3 个企业、129 条业务记录、3 条文件记录；临时恢复库已清理。

2026-10-05 经用户确认，此前的 10 个拆分服务已全部提交删除，平台返回的执行时间为北京时间当天 14:34:14–14:34:51；最终移除尚未核验。旧服务均暂停，只有上述两个服务运行。管理员新密码登录及健康检查通过。具体清理记录见 [旧服务清理记录](zeabur-cleanup.md)。

## 文件与备份

- /data/objects：原件的正式存储，保留原相对路径。
- /data/migration-originals.json：首次迁移清单。
- /data/backups/hui-<UTC时间>.dump：数据库归档。
- 同名 .originals.json：该次备份的原件清单。
- /data/backups/originals：逐个核验 SHA-256 的原件副本。
- /data/backups/legacy：从旧备份服务保留的历史文件。

主应用启动时及每 24 小时生成备份，归档不自动删除。备份仍与主应用处于同机、同卷，不能抵御服务器或磁盘丢失；正式经营前应同步到独立位置，并另行保存 ENCRYPTION_KEY。备份失败会记录 COMPACT_BACKUP_FAILED 和状态文件，修复原因后重启主服务可以重试。

## 更新方式

保留本文件中的服务 ID、现有数据库卷及 application 卷。通过 CI 后使用 npx zeabur@latest service update tag --id 6ac28fa30bdfb9653793d1bb -t <已验证提交> -y -i=false 更新主应用，不要向本项目再次部署模板。

新建空项目时先部署官方 PostgreSQL 模板 B20CX0 并关闭 TCP 转发，然后参考 deploy/zeabur/application.yaml 部署一个主应用。初始化后关闭 BOOTSTRAP_ON_START；schema 改动需要单独审查迁移，不能对现有业务数据库运行 db push。

模型接口仍需企业自行配置，真实店铺/Accio 导出权限仍未验证。本次合并不改变经营功能、企业隔离和人工确认流程。
