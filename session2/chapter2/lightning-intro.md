## 2.2 TiDB 数据导入工具 Lightning

TiDB Lightning 是一个将全量数据高速导入到 TiDB 集群的工具，速度可达到传统执行 SQL 导入方式的 3 倍以上、大约每小时 300 GB。Lightning 有以下两个主要的使用场景：一是大量新数据的快速导入、二是全量数据的备份恢复。目前，Lightning 支持 Mydumper 或 CSV 输出格式的数据源。
