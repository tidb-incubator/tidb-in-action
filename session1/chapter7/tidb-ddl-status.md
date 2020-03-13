## 7.2 如何查看 DDL 状态

### 7.2.1 TiDB DDL 特点
大多数数据库执行 DDL 操作时，或多或少会对正在访问该数据库的 SQL 产生影响。例如，在执行 DDL 期间可能会有锁表操作，此时访问该表的 SQL 会被阻塞。因此，一般在表结构设计阶段都会尽量避免后续产生 DDL 操作。如果必须执行 DDL操作，也只能选择在业务低峰期操作，尽量减少对线上业务的影响。

TiDB 上的 DDL 操作，不会阻塞任何该数据库上正在执行的 SQL，对业务的 SQL 访问和对 DBA 运维都极为友好，这也是 TiDB 相较于其他数据库产品的一大优势所在。

### 7.2.2 对 DDL 进行管理
TiDB 对 MySQL 语法进行了扩展，通过 ADMIN 语句对 DDL 操作进行管理。下面罗列了 DDL 管理的基本命令，各命令返回结果中各字段的详细含义，请参考[官方 admin 相关文档](https://pingcap.com/docs-cn/stable/reference/sql/statements/admin/#admin)。

- 查看当前 schema version，owner 信息以及正在执行的 DDL 任务。

```
ADMIN SHOW DDL;
```

- 查看当前未执行完成的 DDL 任务(包括正在运行的 DDL 任务和等待运行的任务)以及最近 NUM 条(默认 10 )已经执行完成的 DDL 任务。
```ADMIN SHOW DDL JOBS [NUM] [WHERE where_condition];```

    - 例如，显示当前未完成的 DDL 任务，以及最近 5 条已经执行完成的 DDL 任务。
        ```
        ADMIN SHOW DDL JOBS 5;
        ```
    - 例如，显示 test 数据库中未执行完成的 DDL 任务，以及最近 5 条已经执行完成但执行失败的 DDL 任务。
        ```
        ADMIN SHOW DDL JOBS 5 WHERE state!='synced' AND db_name='test';
        ```

- 根据 JOB_ID 查询具体的 DDL 语句。

```
ADMIN SHOW DDL JOB QUERIES job_id [, job_id] ...;
```

- 取消正在执行中的 DDL 任务。

```
ADMIN CANCEL DDL JOBS job_id [, job_id] ...;
```

- 通过 JOB_ID 恢复表，等价于：`RECOVER TABLE table_name`。

```
RECOVER TABLE BY JOB ddl_job_id;
```
**特别注意**
在执行一些 DDL 操作时（如 `ADD INDEX` ），由于执行时间较长，不会立即返回执行结果，mysql-client 会处于卡死的状态。此时可以放心的 `ctrl+c` 来终止该连接，不会影响 DDL 的实际执行。DDL 正常耗时可以参考[相关官方文档](https://pingcap.com/docs-cn/stable/faq/tidb/#332-ddl-%E5%9C%A8%E6%AD%A3%E5%B8%B8%E6%83%85%E5%86%B5%E4%B8%8B%E7%9A%84%E8%80%97%E6%97%B6%E6%98%AF%E5%A4%9A%E5%B0%91)。

```
> admin@sbtest02:04:32>alter table sbtest1 add key idx_c_pad(c, pad);
^CCtrl-C -- sending "KILL QUERY 15768094" to server ...
Ctrl-C -- query aborted.
^CCtrl-C -- exit!
Aborted
```
通过 `ADMIN SHOW DDL` 查询确认，被 `ctrl+c` 之后，该 DDL 依旧正常运行。

```
> admin@(none)02:04:56>ADMIN SHOW DDL\G
*************************** 1. row ***************************
   SCHEMA_VER: 6765
     OWNER_ID: 828a4567-91a5-4070-b55f-f90702e80e7a
OWNER_ADDRESS: 10.40.216.9:4000
 RUNNING_JOBS: ID:8406, Type:add index, State:running, SchemaState:write reorganization, SchemaID:7299, TableID:7380, RowCount:196608, ArgLen:0, start time: 2020-03-07 14:04:53.321 +0800 CST, Err:<nil>, ErrCount:0, SnapshotVersion:415121039339290634
      SELF_ID: 828a4567-91a5-4070-b55f-f90702e80e7a
        QUERY: alter table sbtest1 add key idx_c_pad(c, pad)
1 row in set (0.02 sec)
```
除此之外，也可以通过访问 TiDB 提供的 HTTP 接口查看当前 owner 所在 TiDB，以及各个 TiDB 节点 `ddl_id`、`lease` 等信息，用法如下：

```console
# 用法
curl http://{TiDBIP}:10080/info/all
# 例如
$curl http://127.0.0.1:10080/info/all
{
    "servers_num": 2,
    "owner_id": "29a65ec0-d931-4f9e-a212-338eaeffab96",
    "is_all_server_version_consistent": true,
    "all_servers_info": {
        "29a65ec0-d931-4f9e-a212-338eaeffab96": {
            "version": "5.7.25-TiDB-v4.0.0-alpha-669-g8f2a09a52-dirty",
            "git_hash": "8f2a09a52fdcaf9d9bfd775d2c6023f363dc121e",
            "ddl_id": "29a65ec0-d931-4f9e-a212-338eaeffab96",
            "ip": "",
            "listening_port": 4000,
            "status_port": 10080,
            "lease": "45s",
            "binlog_status": "Off"
        },
        "cd13c9eb-c3ee-4887-af9b-e64f3162d92c": {
        "version": "5.7.25-TiDB-v4.0.0-alpha-669-g8f2a09a52-dirty",
        "git_hash": "8f2a09a52fdcaf9d9bfd775d2c6023f363dc121e",
        "ddl_id": "cd13c9eb-c3ee-4887-af9b-e64f3162d92c",
        "ip": "",
        "listening_port": 4001,
        "status_port": 10081,
        "lease": "45s",
        "binlog_status": "Off"
        }
    }
}
```
### 7.2.3 DDL 相关参数
#### 参数
* `tidb_ddl_reorg_worker_cnt`

| 属性  | 值  |
|:------------- |:---------------:|
| 作用域      | GLOBAL |
| 默认值      | 4        |
| 作用 | 控制数据回填（re-organize）阶段的并发度       |


* `tidb_ddl_reorg_batch_size`

| 属性  | 值  |
|:------------- |:---------------:|
| 作用域      | GLOBAL |
| 默认值      | 256        |
| 最小值      | 32   | 
| 最大值      | 10240   |
| 作用 | 控制数据回填（re-organize）阶段一次回填的数据量       |


* `tidb_ddl_reorg_priority`

| 属性  | 值  |
|:------------- |:---------------:|
| 作用域      | GLOBAL &#124;SESSION |
| 默认值      | PRIORITY_LOW        |
| 作用   | 控制数据回填（re-organize）阶段执行的优先级   | 

* `tidb_ddl_error_count_limit`

| 属性  | 值  |
|:------------- |:---------------:|
| 作用域         | GLOBAL   | 
| 默认值         | 512   | 
| 作用   | 控制 DDL 操作失败重试的次数，重试次数超过该值，则取消 DDL 操作   | 

#### 使用场景
TiDB 集群中，用户执行的 DDL 操作分两类：普通 DDL 操作和加索引操作。普通 DDL 操作执行时间短，一般秒级就可以执行完成；而加索引操作由于需要回填数据，因此执行时间略长。而在回填数据期间，需要将回填的数据写入 TiKV，对 TiKV 会产生额外的写入压力，从而造成一些性能影响。相关的测试可以参考：[线上负载与 ADD INDEX 相互影响的测试](https://pingcap.com/docs-cn/stable/benchmark/add-index-with-load/#tidb_ddl_reorg_batch_size--32)。

TiDB 提供了参数 `tidb_ddl_reorg_worker_cnt` 和 `tidb_ddl_reorg_batch_size` 用来控制回填数据的速度。通过调整参数，可以在业务访问高峰到来时降低 DDL 速度，保证对业务的正常访问无影响；而在业务访问低峰增加 DDL 速度，从而更快的完成 DDL 任务。

**注意**
- 参数 `tidb_ddl_reorg_priority` 调整优先级，可能会对正常的 SQL 请求有一定的影响，一般默认值即可。

- 参数 `tidb_ddl_error_count_limit` 则用来控制重试次数，当发生异常（诸如由于超时、TiKV 无法连接等）时，可进行重试；超过重试次数则终止当前 DDL，一般默认值即可。

### 7.2.4 DDL 处理流程
TiDB-Server 作为 SQL 的统一入口，DDL 操作也首先经由 TiDB-Server 处理，TiDB 可以多点写入，也就是不同的 TiDB-Server 可以同时接受 DDL 操作请求。

为了保证 TiDB-Server 异常重启而丢失 DDL 信息，首先 TiDB-Server 会将 DDL 操作封装成一个拥有唯一标识的 DDL Job，存储到 TiKV 上的任务队列中，持久化保存。

每个 TiDB-Server 上都拥有执行 DDL 任务的 worker 。但是，各个 TiDB-Server 会竞选出唯一一个 Owner 节点来执行实际 DDL 任务，其他竞选失败的 TiDB-Server 节点虽然可以接受 DDL 请求，但是不负责执行 DDL 任务。Owner 会定期对自己的 Owner 身份续租。如果当前 Owner 出现异常，剩余的节点会再次竞选 Owner 。

Owner 节点上的 worker 会从任务队列中依次取出 DDL 任务执行。然而由于 `ADD INDEX` 类型的 DDL 任务在数据量很大情况下执行时间特别长（需要回填数据），从而导致其余的 DDL 操作会被阻塞，TiDB 对该处进行了优化。将任务队列一分为二，一个队列用来存储非 `ADD INDEX` 类型的 DDL 任务，一个队列用来存储 `ADD INDEX` 类型的 DDL 任务。Owner 上的不同的 worker 也会从不同的队列中获取对应的 DDL 任务进行执行。当然，该优化也会引入任务依赖问题。任务依赖问题指的是，同一张表的 DDL 任务，任务编号小的需要先执行。因此在执行 DDL 之前需要对依赖进行检查。

Owner 上的 worker 在处理 `ADD INDEX` 类型 DDL 任务时，涉及到回填数据的过程。该过程会启动 `tidb_ddl_reorg_worker_cnt` 个线程，每次每个线程处理 `tidb_ddl_reorg_batch_size` 大小的数据。因此通过调整这两个参数，可以动态控制 `DDL` 执行速度。

当 DDL 任务执行完成之后，会将执行完成的 DDL 任务移动至历史任务队列（job history queue）中，方便后续通过命令进行 DDL 任务的历史查询。

完整的 DDL 执行流程如下图所示，更详细的内容，可以参考 [DDL 源码解析](https://pingcap.com/blog-cn/tidb-source-code-reading-17/)。

![图片](./images/ddl-workflow.png)

### 7.2.5 DDL 变更原理
TiDB 在线表变更的原理借鉴自论文 《Online, Asynchronous Schema Change in F1》，通过在表结构变更过程中引入额外状态从而实现了一套在线表变更协议，使得集群存在相邻两个版本的 schema 时候，不会破坏数据完整性或发生数据异常。因此，在实现上，要求集群中在同一个表上所有 schema 版本最多存在两个相邻的版本。

例如，以 `ADD INDEX` 类型的 DDL 操作为例，其状态变化如下表所示：

| schema版本  | 状态  | 说明  |
|:------------- |:---------------|:---------------:|
| schema version 1   | absent   | 添加索引之前。   | 
| schema version 2   | delete only   | schema 元信息已经修改，但此时对外不可见。内部索引数据不可添加/更新，仅可删除。   | 
| schema version 3   | write only   | 此时对外不可见，内部索引数据可任意修改。   | 
| schema version 4   | write reorgnization   | 内部索引数据可任意修改，并且进行索引的回填。   | 
| schema version 5   | public   | 此时对外可见，索引添加完成。   | 

TiDB 在该论文的基础上又进行了一些优化。例如，在执行 `ADD COLUMN` 类型 DDL 时，TIDB并没有对数据进行回填，而是将最新添加的列的 default 值保存到 schema 的"原始默认值"字段中，在读取阶段如果 TiKV 发现该列值为 `null` 并且"原始默认字段"不为 `null`，则会使用"原始默认字段"对该 `null` 列进行填充，并将填充后的结果从 TiKV 返回。通过这种优化，该 DDL 操作不需要关心表中实际行数，可以更快的完成 DDL 变更。

再例如，一些涉及删除数据的 DDL 操作，诸如：`DROP INDEX`，`DROP TABLE`，`DROP DATABASE`，`TRUNCATE TABLE` 等，在实现上，除了要完成和普通 DDL 变更一样的逻辑外，还需要对待删除的数据进行处理。TiDB 做法是，将这些需要删除的数据记录到 `gc_delete_range` 表中，通过 GC 机制，将对应的数据再进行删除。当然如果是删除某列的 DDL 操作，由于目前是行存储模式，删除列的代价会比较大，所以暂时只是在 schema 上进行删除列的标记，并不会实际删除该列的数据。

更详细的 DDL 实现原理及优化细节可以参考 [TiDB DDL architecture](https://github.com/pingcap/tidb/blob/master/docs/design/2018-10-08-online-DDL.md)。
