## 3.2 元信息管理

上节介绍了表中的数据和索引如何映射为 (Key, Value) 键值对，本节介绍一下元信息的存储。TiDB 中每个 `Database` 和 `Table` 都有元信息，也就是其定义以及各项属性。这些信息也需要持久化，TiDB 将这些信息也存储在了 TiKV 中。

每个 `Database`/`Table` 都被分配了一个唯一的 ID，这个 ID 作为唯一标识，并且在编码为 Key-Value 时，这个 ID 都会编码到 Key 中，再加上 `m_` 前缀。这样可以构造出一个 Key，Value 中存储的是序列化后的元信息。

除此之外，TiDB 还用一个专门的 (Key, Value) 键值对存储当前所有表结构信息的最新版本号。这个键值对是全局的，每次 DDL 操作的状态改变时其版本号都会加1。目前，TiDB 把这个键值对存放在 pd-server 内置的 etcd 中，其Key 为"/tidb/ddl/global_schema_version"，Value 是类型为 int64 的版本号值。 TiDB 使用 Google F1 的 Online Schema 变更算法，有一个后台线程在不断的检查 etcd 中存储的表结构信息的版本号是否发生变化，并且保证在一定时间内一定能够获取版本的变化。
