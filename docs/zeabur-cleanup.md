# 旧服务清理记录

状态：2026-10-05 经用户确认，10 个旧服务的删除请求已全部被 Zeabur 接受；合并及恢复验收已完成。平台返回的 scheduledDeleteAt 为北京时间当天 14:34:14–14:34:51，删除执行前服务仍显示在列表中。当前核验的是已安排删除，尚未核验最终移除。

继续保留 hui-business（6ac28fa30bdfb9653793d1bb）和 postgresql（6ac28bf60bdfb9653793d03e）。两者均为 RUNNING，scheduledDeleteAt 均为空；10 个旧服务均已暂停。

原件已迁移并校验，旧备份已保存至新主应用 /data/backups/legacy/，本机 data/legacy-backups/ 另有受保护副本。

| 待平台执行删除的旧服务 | ID | 状态 |
|---|---|---|
| minio | 6ac28bff0bdfb9653793d04f | 已安排删除 |
| rustfs | 6ac28d4c0bdfb9653793d0c0 | 已安排删除 |
| web | 6ac28dc10bdfb9653793d0ed | 已安排删除 |
| bootstrap | 6ac28dc10bdfb9653793d0ee | 已安排删除 |
| api | 6ac28dc10bdfb9653793d0ef | 已安排删除 |
| worker | 6ac28dc10bdfb9653793d0f0 | 已安排删除 |
| worker-runtime | 6ac28fa30bdfb9653793d1bc | 已安排删除 |
| api-runtime | 6ac28fa30bdfb9653793d1bd | 已安排删除 |
| database-backup | 6ac292d90bdfb9653793d2a3 | 已安排删除 |
| originals-backup | 6ac292d90bdfb9653793d2a2 | 已安排删除 |

已核对服务清单和各服务的删除时间。管理员密码按用户要求重置，旧会话已撤销；已通过公网 HTTPS 验证新密码登录、身份查询、退出及健康检查。凭据仅保存在受保护且排除 Git 的本机交接文件中。
