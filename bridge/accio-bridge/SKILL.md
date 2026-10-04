---
name: accio-bridge
description: 在用户已授权的店铺中获取指定原始文件，并通过任务专用凭据上传到汇商经营工作台。用于数据采集与传递，实际读取能力按当前 Accio 环境验证。
---

读取用户提供的 collection-task.json。确认任务的平台、数据集、时间范围、时区和允许采集方式；仅访问用户当前已经授权的店铺。

优先下载平台生成的原文件。无法导出时，记录实际可取得的内容：页面提取、部分明细、日报汇总或 AI 摘要。保留原件，不补造缺失行、ID、时间或金额，不将摘要写成交易明细。摘要只能作为 knowledge 数据集。

在本地指定目录保存文件，根据 [manifest.example.json](references/manifest.example.json) 编写清单。清单 collection_request_id 使用任务 id；source_platform 使用任务店铺的平台。每文件声明 dataset、采集方法、期间、粒度与限制。不知道完整性、时区和预期行数时填 null / unknown。期间开始包含，结束不包含。不要在文件、清单或提示中记录密码、Cookie、上传凭据。

上传凭据由用户通过 HUI_UPLOAD_TOKEN 环境变量交给程序。不要输出或读取环境中的其他密钥。使用当前环境实际可用的 Python 3；Windows 用户指定的解释器为 D:\Anaconda\Anaconda\python.exe，其他环境先确认解释器路径。

调用随本项目提供的 [upload.py](scripts/upload.py)：

```text
<python-path> upload.py --api-base <task.api_base> --manifest <manifest.json> --directory <export-dir> --state <session-state.json>
```

程序会补充文件大小与 SHA-256，创建会话、上传、重试及提交后台解析。同一 state 文件用于中断后恢复；已有会话只能在原任务凭据有效且未撤销时恢复，凭据过期后向管理员取得新任务凭据并新建会话。不得自动确认正式入库。

输出采集方法、实际覆盖期间、文件数量、可知行数、缺失项、限制和上传状态。失败时保留已下载原件，并报告程序给出的可操作原因。不得替用户计算最终利润、修改商品、报价、发送消息或触发平台操作。
