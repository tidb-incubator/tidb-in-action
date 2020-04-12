## 2.1 增量数据订阅 CDC

Change Data Capture（CDC）是用来识别、捕捉、交付 TiDB/TiKV 上数据变更的工具系统。在 TiDB 生态链上，CDC 作为 TiDB 的数据出口有着非常重要的地位，其作用包括:
- 构建 TiDB 主从、灾备系统。
- 链接 TiDB 和其它异构数据库。
- 自定义业务逻辑。

