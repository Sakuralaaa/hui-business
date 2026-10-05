# 旧服务清理记录

状态：合并及恢复验收已完成，旧服务全部暂停，等待永久删除确认。

仅保留 hui-business（6ac28fa30bdfb9653793d1bb）和 postgresql（6ac28bf60bdfb9653793d03e）。

原件已迁移并校验，旧备份已保存至新主应用 /data/backups/legacy/，本机 data/legacy-backups/ 另有受保护副本。

| 待删除旧服务 | ID | 状态 |
|---|---|---|
| minio | 6ac28bff0bdfb9653793d04f | 已暂停 |
| rustfs | 6ac28d4c0bdfb9653793d0c0 | 已暂停 |
| web | 6ac28dc10bdfb9653793d0ed | 已暂停 |
| bootstrap | 6ac28dc10bdfb9653793d0ee | 已暂停 |
| api | 6ac28dc10bdfb9653793d0ef | 已暂停 |
| worker | 6ac28dc10bdfb9653793d0f0 | 已暂停 |
| worker-runtime | 6ac28fa30bdfb9653793d1bc | 已暂停 |
| api-runtime | 6ac28fa30bdfb9653793d1bd | 已暂停 |
| database-backup | 6ac292d90bdfb9653793d2a3 | 已暂停 |
| originals-backup | 6ac292d90bdfb9653793d2a2 | 已暂停 |
