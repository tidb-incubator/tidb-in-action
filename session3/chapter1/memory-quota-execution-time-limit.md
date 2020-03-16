# 1.5 限制 SQL 内存使用和执行时间
限制SQL内存使用和执行时间主要是为限制消耗系统资源多的SQL，防止某条SQL造成OOM或影响到集群的整体性能。

## 1.5.1 限制SQL内存使用
限制SQL内存使用有如下三种方式。
1. 通过配置文件参数修改
* `oom-action`
  * 默认值："log"
  * 当 TiDB 中单条 SQL 的内存使用超出 `mem-quota-query` 限制且不能再利用临时磁盘时的行为。
  * 目前合法的选项为 ["log", "cancel"]。
  * 如果配置项使用的是 "log"，那么当一条 SQL 的内存使用超过一定阈值后，TiDB 会在 log 文件中打印一条 LOG，然后这条 SQL 继续执行，之后如果发生了 OOM 可以在 LOG 中找到对应的 SQL。
  * 如果上面的配置项使用的是 "cancel"，那么当一条 SQL 的内存使用超过一定阈值后，TiDB 会立即中断这条 SQL 的执行并给客户端返回一个 error，error 信息中会详细写明这条 SQL 执行过程中各个占用内存比较多的物理执行算子的内存使用情况。
* `mem-quota-query`
  * 默认值：34359738368（32GB）
  * 单条 SQL 语句可以占用的最大内存阈值。
  * 超过该值的请求会被 `oom-action` 定义的行为所处理。
* `oom-use-tmp-storage`
  * 默认值：true
  * 设置是否在单条 SQL 语句的内存使用超出 `mem-quota-query` 限制时为某些算子启用临时磁盘。
* `tmp-storage-path`
  * 默认值：<操作系统临时文件夹>/tidb/tmp-storage
  * 单条 SQL 语句的内存使用超出 `mem-quota-query` 限制时，某些算子的临时磁盘存储位置。
  * 此配置仅在 `oom-use-tmp-storage` 为 true 时有效。
  
2. 修改session级变量
* `tidb_mem_quota_query`
  * 默认值：32 GB
  * 设置一条查询语句的内存使用阈值。 如果一条查询语句执行过程中使用的内存空间超过该阈值，会触发 TiDB 启动配置文件中 `OOMAction` 项所指定的行为。
* `tidb_mem_quota_hashjoin`
  * 默认值：32 GB
  * 设置 `HashJoin` 算子的内存使用阈值。 如果 `HashJoin` 算子执行过程中使用的内存空间超过该阈值，会触发 TiDB 启动配置文件中 `OOMAction` 项所指定的行为。
* `tidb_mem_quota_mergejoin`
  * 默认值：32 GB
  * 设置 `MergeJoin` 算子的内存使用阈值。 如果 `MergeJoin` 算子执行过程中使用的内存空间超过该阈值，会触发 TiDB 启动配置文件中 `OOMAction` 项所指定的行为。
* `tidb_mem_quota_sort`
  * 默认值：32 GB
  * 设置 Sort 算子的内存使用阈值。 如果 `Sort` 算子执行过程中使用的内存空间超过该阈值，会触发 TiDB 启动配置文件中 `OOMAction` 项所指定的行为。
* `tidb_mem_quota_topn`
  * 默认值：32 GB
  * 设置 TopN 算子的内存使用阈值。 如果 `TopN` 算子执行过程中使用的内存空间超过该阈值，会触发 TiDB 启动配置文件中 `OOMAction` 项所指定的行为。
* `tidb_mem_quota_indexlookupreader`
  * 默认值：32 GB
  * 设置 `IndexLookupReader` 算子的内存使用阈值。如果 `IndexLookupReader` 算子执行过程中使用的内存空间超过该阈值，会触发 TiDB 启动配置文件中 `OOMAction` 项所指定的行为。
* `tidb_mem_quota_indexlookupjoin`
  * 默认值：32 GB
  * 设置 `IndexLookupJoin` 算子的内存使用阈值。 如果 `IndexLookupJoin` 算子执行过程中使用的内存空间超过该阈值，会触发 TiDB 启动配置文件中 `OOMAction` 项所指定的行为。
* `tidb_mem_quota_nestedloopapply`
  * 默认值：32 GB
  * 设置 `NestedLoopApply` 算子的内存使用阈值。 如果 `NestedLoopApply` 算子执行过程中使用的内存空间超过该阈值，会触发 TiDB 启动配置文件中 `OOMAction` 项所指定的行为。

示例：  
配置整条 SQL 的内存使用阈值为 8GB：
```sql
set @@tidb_mem_quota_query = 8 << 30;
```
配置整条 SQL 的内存使用阈值为 8MB：
```sql
set @@tidb_mem_quota_query = 8 << 20;
```

3. 使用 Optimizer Hints
* `memory_quota`
  * Hint 支持 MB 和 GB 两种单位。
  * 限制查询执行时的内存使用，内存使用超过该限制时会根据当前设置的内存超限行为来打出一条 log 或者终止语句的执行。

示例：  
限制SQL执行的内存为1024 MB：
```sql
select /*+ MEMORY_QUOTA(1024 MB) */ * from t;
```
## 1.5.2 限制SQL执行时间

1. 修改session/global变量
* `max_execution_time`
  * 单位为：ms
  * 目前对所有类型的 statement 生效，并非只对 SELECT 语句生效。实际精度在 100ms 级别，而非更准确的毫秒级别。
  
示例：  
设置最大执行时间为10秒。
```sql
set @@global.MAX_EXECUTION_TIME=10000
```

2. 使用 Optimizer Hints
* `max_execution_time`
  * 单位为：ms
  * 把查询的执行时间限制在指定的 N 毫秒以内，超时后服务器会终止这条语句的执行。
  
示例：  
设置SQL执行超时时间为1000 毫秒（即 1 秒）。
```sql
select /*+ MAX_EXECUTION_TIME(1000) */ * from t1 inner join t2 where t1.id = t2.id;
```

## 1.5.3 定位消耗系统资源多的查询语句
上面介绍了如何限制SQL的内存使用和执行时间，如果一条语句在执行过程中达到或超过资源使用阈值时（执行时间/使用内存量）则会即时将这条语句写入到日志文件（默认文件为：`tidb.log`），用于在语句执行结束前定位消耗系统资源多的查询语句，帮助用户分析和解决语句执行的性能问题。以下是一条 Expensive query 日志示例：
```
[2020/02/05 15:32:25.096 +08:00] [WARN] [expensivequery.go:167] [expensive_query] [cost_time=60.008338935s] [wait_time=0s] [request_count=1] [total_keys=70] [process_keys=65] [num_cop_tasks=1] [process_avg_time=0s] [process_p90_time=0s] [process_max_time=0s] [process_max_addr=10.0.1.9:20160] [wait_avg_time=0.002s] [wait_p90_time=0.002s] [wait_max_time=0.002s] [wait_max_addr=10.0.1.9:20160] [stats=t:pseudo] [conn_id=60026] [user=root] [database=test] [table_ids="[122]"] [txn_start_ts=414420273735139329] [mem_max="1035 Bytes (1.0107421875 KB)"] [sql="insert into t select sleep(1) from t"]
```
各字段的含义如下：

基本字段
* `cost_time`：日志打印时语句已经花费的执行时间。
* `stats`：语句涉及到的表或索引使用的统计信息版本。值为 pesudo 时表示无可用统计信息，需要对表或索引进行 analyze。
* `table_ids`：语句涉及到的表的 ID。
* `txn_start_ts`：事务的开始时间戳，也是事务的唯一 ID，可以用这个值在 TiDB 日志中查找事务相关的其他日志。
* `sql`：SQL 语句。

内存使用相关字段
* `mem_max`：日志打印时语句已经使用的内存空间。该项使用两种单位标识内存使用量，分别为 Bytes 以及易于阅读的自适应单位（比如 MB、GB 等）。

用户相关字段
* `user`：执行语句的用户名。
* `conn_id`：用户的连接 ID，可以用类似 con:60026 的关键字在 TiDB 日志中查找该连接相关的其他日志。
* `database`：执行语句时使用的 database。

TiKV Coprocessor Task 相关字段
* `wait_time`：该语句在 TiKV 的等待时间之和，因为 TiKV 的 Coprocessor 线程数是有限的，当所有的 Coprocessor 线程都在工作的时候，请求会排队；当队列中有某些请求耗时很长的时候，后面的请求的等待时间都会增加。
* `request_count`：该语句发送的 Coprocessor 请求的数量。
* `total_keys`：Coprocessor 扫过的 key 的数量。
* `processed_keys`：Coprocessor 处理的 key 的数量。与 `total_keys` 相比，`processed_keys` 不包含 MVCC 的旧版本。如果 processed_keys 和 total_keys 相差很大，说明旧版本比较多。
* `num_cop_tasks`：该语句发送的 Coprocessor 请求的数量。
* `process_avg_time`：Coprocessor 执行 task 的平均执行时间。
* `process_p90_time`：Coprocessor 执行 task 的 P90 分位执行时间。
* `process_max_time`：Coprocessor 执行 task 的最长执行时间。
* `process_max_addr`：task 执行时间最长的 Coprocessor 所在地址。
* `wait_avg_time`：Coprocessor 上 task 的等待时间。
* `wait_p90_time`：Coprocessor 上 task 的 P90 分位等待时间。
* `wait_max_time`：Coprocessor 上 task 的最长等待时间。
* `wait_max_addr`：task 等待时间最长的 Coprocessor 所在地址。
