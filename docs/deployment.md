# 两个服务的部署与升级

所有构建、测试与镜像验证在 GitHub Actions 或服务器进行。本机只编辑文件、查看结果。

部署只需要两个服务：`app`（网页、API、Worker、每日备份）及 `db`（PostgreSQL）。主应用使用 `ghcr.io/sakuralaaa/hui-business-api:<通过CI的提交>`，兼容 AMD64 / ARM64。沿用原 API 镜像包名，内容已包含网页。

1. 检查 GitHub Actions 的 Validate and publish 成功，固定 APP_IMAGE 的提交标签。
2. 将 compose.yaml、deploy/ 和 .env.example 放到服务器；复制 .env.example 为 .env。API、Worker、备份角色使用三个不同的随机密码，分别为 24 字节随机数的 48 位十六进制表示。ENCRYPTION_KEY 是 32 字节随机数的 64 位十六进制表示。
3. 仅第一次空库部署设置 BOOTSTRAP_ON_START=true，配置管理员账号。在服务器执行 docker compose pull 和 docker compose up -d。镜像内初始化脚本安装 schema、角色与企业策略，然后创建管理员及模拟企业。初始化完成后将该开关改为 false；保留加密密钥。
4. HTTPS 入口代理到 127.0.0.1:8080，PUBLIC_URL 必须与浏览器实际 origin 一致，COOKIE_SECURE=true。数据库没有公网端口。
5. 登录后先检查两个演示企业隔离，再在真实企业创建店铺及采集任务。

主应用的 /data 是持久化卷：原件在 /data/objects，每日数据库归档和原件副本在 /data/backups。容器重建、升级时必须保留此卷与数据库卷。PostgreSQL 18 的数据卷挂在 /var/lib/postgresql；从旧版数据库升级必须进行独立迁移，禁止直接把旧版数据目录交给新版镜像。

API、Worker、备份使用独立数据库角色。API 保留行级企业隔离，备份角色只读且可读取被 RLS 保护的记录。supervisord 负责进程重启；网页、API、Worker、备份在非 root 用户下执行。入口进程仅在启动时处理卷权限及明确开启的初始化。合并部署会共享一个容器的资源和故障范围，不形成进程之间的独立安全边界。

/api/health 检查数据库连接和 Worker 最近的任务调度心跳；备份结果另查 /data/backups/status.json。服务可访问不代表当天备份成功。

## 备份与恢复

备份在主应用每次启动及每 24 小时运行，使用 PostgreSQL 18 pg_dump，生成 hui-<UTC时间>.dump 及对应的 .originals.json 清单。原件副本逐个核对 SHA-256。备份失败写入状态并记录 COMPACT_BACKUP_FAILED，修复后可重启备份进程或主服务重试。归档不自动清理，需关注磁盘容量。

这里是同机、同卷副本，不能抵御服务器或磁盘丢失。正式经营前把数据库归档、原件副本和加密密钥备份到独立位置。

恢复先在隔离空数据库用 pg_restore 验证归档，恢复原件至相同相对路径、恢复相同加密密钥，并核查业务版本和原件哈希。确认后再切换应用，不在运行中的真实数据库上直接覆盖恢复。数据库角色需按照安装脚本另行建立，pg_dump 不包含全局角色密码。

## 升级和排错

先备份数据库、原件及密钥，记录原镜像标签，再更新 APP_IMAGE 并在服务器拉取镜像和更新 app。初始 schema 已登记哈希；schema 改动必须有经过审查的迁移，禁止在真实库执行 db push。升级不需要重新初始化或重置演示数据。

通过 docker compose logs app 查看合并后的日志。关注 COMPACT_BACKUP_SAVED、任务失败、导入拒绝及模型调用错误。模型服务白名单仍通过 MODEL_HOST_ALLOWLIST 设置；合并服务不改变企业权限、模型配置和人工确认流程。

S3 适配仍保留在代码中，默认两个服务部署使用持久化磁盘。未来扩容可以恢复独立 Worker 或对象存储，无需改业务协议。
