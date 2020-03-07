# 增量数据订阅 CDC

[`ticdc`](https://github.com/pingcap/ticdc) 是一个`TiDB`的事件日志复制工具，用于数据备份，下游支持`MySQL`, `TiDB`, `Kafka`等。`ticdc`会捕获上游`TiKV`的`KV`变化日志，将其还原为`SQL`之后由下游的`MySQL`或`TiDB`进行消费；写入`Kafka`的`KV`日志会在`Kafkf`的下游进行`SQL`还原。
