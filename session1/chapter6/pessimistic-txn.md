## 6.2 悲观事务

乐观事务模型在分布式系统中有着极大的性能优势，但为了让 TiDB 的使用方式更加贴近传统单机数据库，更好的适配用户场景，TiDB v3.0 及之后版本在乐观事务模型的基础上实现了悲观事务模型。本文将介绍 TiDB 悲观事务模型特点。

### 6.2.1 悲观锁解决的问题

通过支持悲观事务，降低用户修改代码的难度甚至不用修改代码：

* 在 v3.0.8 之前，TiDB 默认使用的乐观事务模式会导致事务提交时因为冲突而失败。为了保证事务的成功率，需要修改应用程序，加上重试的逻辑。

- 乐观事务模型在冲突严重的场景和重试代价大的场景无法满足用户需求，支持悲观事务可以 弥补这方面的缺陷，拓展 TiDB 的应用场景。

以发工资场景为例：对于一个用人单位来说，发工资的过程其实就是从企业账户给多个员工的个人账户转账的过程，一般来说都是批量操作，在一个大的转账事务中可能涉及到成千上万的更新，想象一下如果这个大事务执行的这段时间内，某个个人账户发生了消费（变更），如果这个大事务是乐观事务模型，提交的时候肯定要回滚，涉及上万个个人账户发生消费是大概率事件，如果不做任何处理，最坏的情况是这个大事务永远没办法执行，一直在重试和回滚（饥饿）。

### 6.2.2 基于 Percolator 的悲观事务

悲观事务在 Percolator 乐观事务基础上实现，在 Prewrite 之前增加了 Acquire Pessimistic Lock 阶段用于避免 Prewrite 时发生冲突：

* 每个 DML 都会加悲观锁，锁写到 TiKV 里，同样会通过 raft 同步。
* 悲观事务在加悲观锁时检查各种约束，如 Write Conflict、key 唯一性约束等。
* 悲观锁不包含数据，只有锁，只用于防止其他事务修改相同的 Key，不会阻塞读，但 Prewrite 后会阻塞读（和 Percolator 相同，但有了大事务支持后将不会阻塞读）。
* 提交时同 Percolator，悲观锁的存在保证了 Prewrite 不会发生 Write Conflict，保证了提交一定成功。

![1.png](/res/session1/chapter6/pessimistic-txn/1.png)

#### 6.2.2.1 等锁顺序

TiKV 中实现了 `Waiter Manager` 用于管理等锁的事务，当悲观事务加锁遇到其他事务的锁时，将会进入 `Waiter Manager` 中等待锁被释放，TiKV 会尽可能按照事务 start timestamp 的顺序来依次获取锁，从而避免事务间无用的竞争。

#### 6.2.2.2 分布式死锁检测

在 `Waiter Manager` 中等待锁的事务间可能发生死锁，而且可能发生在不同的机器上，`TiDB` 采用分布式死锁检测来解决死锁问题：

- 在整个 TiKV 集群中，有一个死锁检测器 leader。
- 当要等锁时，其他节点会发送检测死锁的请求给 leader。

![2.png](/res/session1/chapter6/pessimistic-txn/2.png)

死锁检测器基于 Raft 实现了高可用，等锁事务也会定期发送死锁检测请求给死锁检测器的 leader，从而保证了即使之前 leader 宕机的情况下也能检测到死锁。

### 6.2.3 最佳实践

#### 6.2.3.1 事务模型的选择

TiDB 支持乐观事务和悲观事务，并且允许在同一个集群中混合使用事务模式。由于悲观事务和乐观事务的差异，用户可以根据使用场景灵活的选择适合自己的事务模式：

* 乐观事务：事务间没有冲突或允许事务因数据冲突而失败；追求极致的性能。
* 悲观事务：事务间有冲突且对事务提交成功率有要求；因为加锁操作的存在，性能会比乐观事务差。

#### 6.2.3.2 使用方法

v3.0.8 及之后版本新建的 TiDB 集群将默认使用悲观事务模式，从乐观事务模式升级的集群仍将使用乐观事务模式。进入悲观事务模式有以下三种方式:

- 执行 `BEGIN PESSIMISTIC`; 语句开启的事务，会进入悲观事务模式。

  可以通过写成注释的形式 `BEGIN /*!90000 PESSIMISTIC */;` 来兼容 MySQL 语法。

- 执行 `set @@tidb_txn_mode = 'pessimistic';`，使这个 session 执行的所有显式事务（即非 autocommit 的事务）都会进入悲观事务模式。

- 执行 `set @@global.tidb_txn_mode = 'pessimistic';`，使之后整个集群所有新创建 session 执行的所有显示事务（即非 autocommit 的事务）都会进入悲观事务模式。

可通过执行 `set @@global.tidb_txn_mode = '';` 还原回乐观事务模式。

#### 6.2.3.3 Batch DML

从上面可以看到，悲观事务在执行每个 DML 时都需要向 TiKV 发送加锁请求，如果事务内 DML 数量很多但 DML 操作很小时，加锁操作会显著增加事务的延迟，所以建议使用悲观事务时尽可能用一条 DML 操作更多的数据。

例如：以下每条 INSERT 都需要向 TiKV 中写入悲观锁，带来了极大的延迟：

```sql
BEGIN;
INSERT INTO my_table VALUES (1);
INSERT INTO my_table VALUES (2);
INSERT INTO my_table VALUES (3);
COMMIT;
```

如果修改为 INSERT 多行，性能将会成倍的提升：

```sql
BEGIN;
INSERT INTO my_table VALUES (1), (2), (3);
COMMIT;
```

#### 6.2.3.4 隔离级别的选择

TiDB 在悲观事务模式下支持了 2 种隔离级别。

一 、默认的与 MySQL 行为基本相同的可重复读隔离级别（Repeatable Read）隔离级别。

但因架构和实现细节的不同，TiDB 和 MySQL InnoDB 的行为在细节上有一些不同：

1. TiDB 使用 range 作为 WHERE 条件，执行 DML 和 `SELECT FOR UPDATE` 语句时不会阻塞范围内并发的 `INSERT` 语句的执行。

   InnoDB 通过实现 gap lock，支持阻塞 range 内并发的 `INSERT` 语句的执行，其主要目的是为了支持 statement based binlog，因此有些业务会通过将隔离级别降低至 READ COMMITTED 来避免 gap lock 导致的并发性能问题。TiDB 不支持 gap lock，也就不需要付出相应的并发性能的代价。

2. TiDB 不支持 `SELECT LOCK IN SHARE MODE`。

   使用这个语句执行的时候，效果和没有加锁是一样的，不会阻塞其他事务的读写。

3. DDL 可能会导致悲观事务提交失败。

   MySQL 在执行 DDL 时会被正在执行的事务阻塞住，而在 TiDB 中 DDL 操作会成功，造成悲观事务提交失败：`ERROR 1105 (HY000): Information schema is changed. [try again later]`。

4. `START TRANSACTION WITH CONSISTENT SNAPSHOT` 之后，MySQL 仍然可以读取到之后在其他事务创建的表，而 TiDB 不能。

5. autocommit 事务不支持悲观锁

   所有自动提交的语句都不会加悲观锁，该类语句在用户侧感知不到区别，因为悲观事务的本质是把整个事务的重试变成了单个 DML 的重试，autocommit 事务即使在 TiDB 关闭重试时也会自动重试，效果和悲观事务相同。

   自动提交的 select for update 语句也不会等锁。

二 、可设置 `SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;` 使用与 Oracle 行为相同的读已提交隔离级别 （Read Committed）。

由于历史原因，当前主流数据库的读已提交隔离级别本质上都是 Oracle 定义的一致性读隔离级别。TiDB 为了适应这一历史原因，悲观事务中的读已提交隔离级别的实质行为也是一致性读。用户可以自由选择适合业务场景的隔离级别。
