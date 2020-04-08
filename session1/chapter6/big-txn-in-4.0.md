## 6.3 4.0 的大事务支持

### 6.3.1 背景
如果做一个调研，在开发或 DBA 日常使用 TiDB 的过程中，最经常遇到的问题或报错是啥，我相信有一个肯定会让大家咬牙切齿，那就是 `transaction too large`。

我们来检索一下 PingCAP 官网文档，以下引用官网 FAQ：

> 4.3.3 `Transaction too large` 是什么原因，怎么解决？
>
> 由于分布式事务要做两阶段提交，并且底层还需要做 Raft 复制，如果一个事务非常大，会使得提交过程非常慢，并且会卡住下面的 Raft 复制流程。为了避免系统出现被卡住的情况，我们对事务的大小做了限制：
>
> * 单个事务包含的 SQL 语句不超过 5000 条（默认）
> * 单条 KV entry 不超过 6MB
> * KV entry 的总条数不超过 30w
> * KV entry 的总大小不超过 100MB

在 Google 的 Cloud Spanner 上面，也有类似的[限制](https://cloud.google.com/spanner/docs/limits)。不过对于初次接触 TiDB 的同学来说，经常是丈二和尚摸不着头脑，会有如下来自灵魂的拷问：

* 为什么在 MySQL/Oracle 中运行的好好的跑批程序，迁移到 TiDB 中就报错 `statement count 5001 exceeds the transaction limitation`？
* 为什么说 kv 总条数不超过 30W，但是我一次更新 10W 条数据就报错 `ERROR 8004 (HY000): transaction too large, len:300001`？

当然更具体的原因和解决办法在 asktug、简书等上面大家可以自行搜索，这里不作赘述。不过好消息是，4.0 版本重大改进，TiDB 终于支持大事务了，下面就带大家一起来探索和体验一下。

### 6.3.2 大事务实现原理
在 4.0 版本之前对于事务的严格限制的原因有很多，但影响最大的是这两点：

* Prewrite 写下的锁会阻塞其他事务的读，大事务的 Prewrite 时间长，阻塞的时间也就长。
* 大事务 Prewrite 时间长，可能会被其他事务终止导致提交失败。

4.0 大事务实际上是对事务机制的优化，适用于所有事务模型。

#### 6.3.2.1 Min Commit Timestamp

以乐观事务为例，TiDB 支持的是 Snapshot Isolation，每个事务只能读到在事务 `start timestamp` 之前最新已提交的数据。在这种隔离级别下如果一个事务读到了锁需要等到锁被释放才能读到值，原因是有可能这个锁所属的事务已经获取了 `commit timestamp` 且比读到锁的事务 `start timestamp` 小，读事务应该读到写事务提交的新值。

为了实现写不阻塞读，TiDB 在事务的 Primary Lock 里保存了 `minCommitTs`，即事务提交时满足隔离级别的最小的 `commit timestamp`。读事务读到锁时会使用自己的 `start timestamp` 来更新锁对应事务的 Primary Lock 里的该字段，从而将读写事务进行了强制排序，保证了读事务读不到写事务提交的值，从而实现了写不阻塞读。

#### 6.3.2.2 Time to live(TTL)

从前面乐观事务部分得知，Percolator 将事务的所有状态都保存在底层存储系统中，Prewrite 也会写下锁用于避免写写冲突，但如果事务在提交过程中 TiDB 挂掉会导致事务遗留下大量的锁阻塞其他事务的执行。TiDB 使用 TTL 来限制锁的存在时间，当锁超时时就会终止对应的事务并清理掉锁，从而当前事务可以继续执行。

在 v4.0 之前，锁的 TTL 是根据事务大小计算得来的，无法反应事务真实的运行情况，有可能运行中事务的锁超时并被其他事务清理掉，最终导致事务提交失败。在 v4.0 中将会使用 `TTL Manager` 实时更新事务 Primary Lock 中的 TTL，从而保证运行中的事务不会被其他事务终止掉。

### 6.3.3 实践
大事务这个功能该如何使用呢？其实大事务是对事务机制的优化，唯一需要修改的是 TiDB 的配置文件，找到这一处配置：

```toml
[performance]
txn-total-size-limit = 104857600
```

然后把数字调大就可以了，然后就可以愉快地继续使用了，比如说往后面多加两个零，只要在 10737418240(10G) 以内就行。来直观感受下在 v3.x 版本和 v4.0 版本执行一个插入几十万条数据语句的情况。

(1) 3.0.5 版本：

```
mysql> insert into t1 (name, age) select name, age from t1;
Query OK, 131072 rows affected (1.86 sec)
Records: 131072  Duplicates: 0  Warnings: 0

mysql> select count(1) from t1;
+----------+
| count(1) |
+----------+
|   262144 |
+----------+
1 row in set (0.14 sec)

mysql> insert into t1 (name, age) select name, age from t1;
ERROR 8004 (HY000): transaction too large, len:300001
```

(2) 4.0 版本：

```sql
MySQL [test]> select count(1) from t1;
+----------+
| count(1) |
+----------+
|   262144 |
+----------+
1 row in set (0.20 sec)

MySQL [test]> insert into t1 (name, age) select name, age from t1;
Query OK, 262144 rows affected (9.20 sec)
Records: 262144  Duplicates: 0  Warnings: 0

MySQL [test]> select count(1) from t1;
c+----------+
| count(1) |
+----------+
|   524288 |
+----------+
1 row in set (0.52 sec)

MySQL [test]> create table t2 like t1;
Query OK, 0 rows affected (0.11 sec)

MySQL [test]> insert into t2 select * from t1;
Query OK, 524288 rows affected (17.61 sec)
Records: 524288  Duplicates: 0  Warnings: 0
```

在 4.0 之前版本，如果执行几十万条数据的插入或复制操作，需要用特殊方法来才绕过事务限制，比如开启 `tidb_batch_insert` 等，但是这些操作是受限且不安全的，未来版本中会被逐渐废弃掉。而在新版本中，可以直接通过大事务支持的特性，来解决老版本中事务限制的问题。

### 6.3.4 限制和改进
TiDB 内部的 GC 执行策略默认是 10min 执行一次，如果事务执行时间太长会因超出 `gc_life_time` 而报错，而大事务执行时间一般都较长。在 v4.0 中，`safepoint` 会根据运行中事务的 `start timestamp` 计算得出，从而不影响大事务的提交。当然在新版本中这个功能依然会有一些受限，具体如下：

* 单个 kv 大小限制 6MB 的限制还在，这是存储引擎层的限制，也就是依然不建议类似 `Blob` 等超长字段存放在 TiDB 中。
* 目前单个事务大小限制在 10GB，超过 10GB 的事务依然会报错，不过 10GB 的事务已经能够覆盖大多数场景了。
* 事务对内存的占用可能会有 3\~4 倍的放大，10GB 大的事务可能会占用 30\~40GB 的内存。如果需要执行特别大的事务，需要提前做好内存的规划，避免对业务产生影响。
