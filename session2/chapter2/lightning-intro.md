# TiDB 数据导入工具 Lightning

[`TiDB Lightning`](https://github.com/pingcap/tidb-lightning)是一个将全量数据高速导入到`TiDB`集群的工具，其特点是将`DDL`和其他数据记录分离开，`DDL`依旧通过`TiDB`进行执行，而其他数据则直接通过`KV`的形式导入到`TiKV`内部。支持`Mydumper`或`CSV`输出格式的数据源，尤其适用于对于需要从`MySQL`将大量数据导入到`TiDB`上的场景。
