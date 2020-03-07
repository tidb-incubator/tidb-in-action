# Mongodb 迁移到 TiDB

## **背景介绍**

MongoDB 对字段维护比较友好，自动故障转移等优势，使很多归档类业务很快在 MongoDB 中完成快速的部署和稳定运行。但在快消时代背景下，很多业务量日活日益增长，相应的数据量也成倍增长，之前的基础架构满足不了现在的需求，需要进行架构重构。而随着技术栈的更新，架构同学倾向于通过 SQL 实现对表的操作，来减少研发成本。
类似直播业务会有带货的子业务需求，数据库的架构中会对大表进行高并发的实时查询和写入操作，还会有少量的更新和删除操作。初选方案时候考虑过 MySQL + 分库分表，但是因为要解决业务上对于分页查询和非分区健查询；另外大数据对用户聚合分析。所以这样会增加部分开发成本，同时数据不好管理。

## **使用 MongoDB 遇到的问题**

开始倾向于MongoS集群，通过 Oplog 解决备份恢复数据一致性的问题。但是随着数据量日益增多，需要花费更多精力，对多个集合关系维护，比如做一些关联更新或者删除的操作。架构组同学对技术栈做了升级，逐渐引导业务代码中支持 SQL。大数据分析平台需要满足多度的分析要求，为了提高 AP 模型下的查询效率，需要通过 MongoDB  将数据先同步到 Kafka，再通过 ClickHouse 完成查询操作，这个链路较长，日常维护以及数据实时查询带来一定的困扰。随着业务的多样性增加，用户社区的数据要提供不同业务模块来完成数据调用，使用 MongoDB 也会带来一定的开发复杂度。其次数据需要频繁在业务平台间迁移，现有的工具不能提供高效的处理方案。

## **分布式数据库调研**

直到调研了 TiDB ，梳理了彼此的优势。

|MongoDB|TiDB|
|----|----|
|1.『灵活模式』+ 『高可用性』 + 『可扩展性』;2.通过 json 文档来实现灵活模式 3.通过复制集来保证高可用;4.通过 Sharded cluster 来保证可扩展性 5. wt cpu 使用比较友好：3.2+版本对数据 zlib 压缩|1.『(减少)分库分表』+ 『高可用性』 + 『可扩展性』;2.减少分库分表带来的架构复杂性;3. 通过多副本来保证高可用;4.通过集群模式来保证可扩展性|

### **TiDB 可以解决以下需求**

- 分布式大容量存储，水平扩展，解决单机容量小对问题，对业务基本无感知。TiDB 集群中的 TIKV 节点可以无感知的弹性扩所容；
- 性能需求，多点读写，因为 TiDB Server 是无状态服务，通过 LB 层后，多个 TiDB Server 来处理业务的读写请求，提高业务的读写吞吐能力；
- 备份恢复/容灾，提供多线程的 MyDumper/Loader 多线程备份恢复工具；另外可以通过 TiDB-binlog 异地容灾;
- 分库分表，业务研发不用考虑分库分表，支持超大表高效读写，提供了分库分表对聚合方案；
- 监控体系比较完善，提供完整的 Prometheus 监控系统支持，可以通过 Grafana 进行日常监控数据图形化分析，Altermanager 通过 wehook 接口完成告警监控；
- 解决大数据分析平台聚合分析，具有 HTAP 能力，大数据分析同学通过 SQL 语言直接访问 TiDB Server 来做聚合分析。

结合以上特点，另外我们也做完整技术性评估调研，调研结果如图所示。如果在满足使用 SQL 提高研发速度，另外减少人力资源成本么，可以选择 TiDB。

![调研架构](/res/session4/chapter5/from-mongodb-to-tidb/1.png)

## **数据迁移**

### **迁移前要考虑的问题**

- 数据类型差异：MongoDB 原有的数据类型属性需要改变，MongoDB 中的 ”_id" 要摒弃，使用 TiDB 自增主键 ID，另外这里需要考虑到写入热点问题，
  - 业务侧可以考虑使用 uuid 或者 snowflakes 算法将主键值进行打散。
  - 使用主键 非 int 类型的 varchar 类型主键，通过 TiDB 的 shard_rowid_bit 进行 hash 打散。当然在 v4.0 版本的 TiDB，提供了 Autorandom key 的特性，通过 Autorandom key 可以自动将 int 主键生成随机数来节点写入热点问题。
  - MongoDB 和 TiDB 的部分字段类型不一样，MongoDB 时间列写入基本都是时间戳，TiDB 提供多种时间的数据类型：Timestamp、date、datetime
- 数据一致性，全量迁移几十亿的数据，增量同步和全量中的变更数据的一致性要保证；
- 关于时间有序性：确认业务表是否有更新时间，如果有实时更新的时间戳的场景，那么要确认该字段是否有关索引，同时如果是有删除数据的操作，那么不能使用更新时间字段作为增量迁移标准；
- 写入性能，线上数据量达到亿级，在全量、增量迁移时要使用批量处理；另外通过 web 增加并发线程。因为有幂等性，即回放多次但最终结果还是一致的，所以需要保证表级有序，即一个表同时只有一个线程在进行增量回放。
- 容错能力，一旦 watch 监听任务出现异常， 从异常时间点开始增量抽取(使用 startAtOperationTime 参数或 redis 记录)，进行重试操作流程。
- 数据转换能力，将转换失败的数据 id 记录下来，重试或程序单独处理时方便根据 id 查找对应的数据

### **迁移方案的整体架构**

整体架构方案如图所示，MongoDB 通过业务双写先完成到 TiDB 集群的全量同步，然后增量数据通过 MongoDB 副本集的 Stream 通过 Kafka 同步到 TiDB 集群，会进行一致性校验。同步完成后，会将业务读请求切换到 TiDB 集群，TiDB 集群配置 TiDB-binlog 到 Kafka 方式，将增量数据同步会 MongoDB 副本集进行一致性校验。此时 TiDB 集群支持读写，MongoDB 副本集支持写入。通过配置中心内置查询实时监控 TiDB 集群和 MongoDB 集群可用性和状态，如果 TiDB 出现故障，DBA 可以通过手动切换到 MongoDB，后面我们会展开具体的实施方案。

![迁移方案](/res/session4/chapter5/from-mongodb-to-tidb/2.png)

> **注意**
>
> 从 MongoDB v3.6 开始提供了 Change Stream [增量]功能，支持对数据变更进行监听，为实现数据同步及转换处理提供了强大的功能；通过对集合的 watch 命令获得一个 MongoCursor 对象，遍历所有的变更获得被监听对象的实时变更。

### **迁移流程**

如果所示，迁移流程主要是 6 个主要部分。
1. 代码实现双写

该业务的主要是实施业务，业务规则中，将获取 max(uid)作为依据进行分页读取数据。所以新增的数据是要小于 max(gid) ，开启双写，TiDB 集群和 MongoDB 集群会分别写入一份数据，另外是在迁移时如果小于 max(gid) 的数据进行 DML 操作，同时在 TiDB 表中进行 DML 操作。

2. Redis 记录迁移记录

第一次拉取全量数据，通过 6 台 web 程序（数据维度分片），每台开启 20 个线程，每个线程读取迁移数据，并会记录迁移的 git，方便线程终止后，不用全量恢复数据；另外会自动生成 log 信息，信息内包含：迁移数据情况、慢查询、错误信息等。

![日志信息](/res/session4/chapter5/from-mongodb-to-tidb/3.png)

3. 进行增量迁移

增量数据迁移方案采用 UpdateTime 和 Stream 方案，因为 UpdatedTime 能将 insert 和 update 增量拉取过去，但是对于物理删除 delete 则检测不到，所以使用 Stream 增量拉取数据到 Kafka，再由程序分析 Kafka 数据后 同步到 TIDB 集群。

4. 避开业务高峰数据迁移，根据业务访问特点，将迁移动作设置为低峰时间段。

5. 数据验证，通过查询表中的数据量总数和业务的验证来保证数据的完整性。

6. 业务实现双写

- 关于写入表数据在迁移 TiDB 表之前，插入写到 MongoDB 副本集和 TiDB 集群，同时源表更新和删除的操作，也会同步到 TiDB 中。在表数据在迁移 TiDB 表之后，原表和 TiDB 表都会进行插入和更新操作。

- 关于读请求表数据在迁移 TiDB 表之前，业务查询，会优先查询 MongoDB 副本集，表数据在迁移 TiDB 表之后，业务查询，会优先查询 TiDB 集群。

- 关于读写请求切换在读写都已经可以在 TiDB 集群中正常完成，就可以将业务的读写请求都通过 TiDB 集群来完成了，

![迁移流程](/res/session4/chapter5/from-mongodb-to-tidb/4.png)

### **关于数据一致性的校验机制的建议**

#### **增量同步与校验机制** 

使用 stream 根据时间拉取数据到 Kafka，最后同步到 TiDB 集群，同时 Redis 也会记录以 gid 为维度的迁移范围数据，可以通过校验 kafka 到 gid 和 redis 到 gid 进行比对是否一致。

![日志截图](/res/session4/chapter5/from-mongodb-to-tidb/5.png)

#### **MongoDB metadata 的一致性验证**

Metadata 作为最重要的 mongodb 表，影响着 MongoDB 的主要功能。虽然有 TiDB 的数据复制来保证数据同步，也最好双重确认来保障服务可用性。我们在 MongoDB 中开发了一个脚本来批量对比两个 meta 表，通过扫描 meta 表所有的键值和时间戳来发现差异。在初期确实发现了差异，也依此来修正了数据复制的配置。

#### **新 TiDB 集群的数据表的可用性验证**

为了验证新集群 TiDB 集群的数据可用性，我们启动了一个测试的 MongoDB 实例用以模拟兼容多个 TiDB 集群的查询。测试实例不直接对用户服务，而是通过回放 SQL query 来进行可用性测试。回放测试自动验证查询是否正常返回。这种测试方式弥补了回归测试用例覆盖范围的不足，通过测试我们确实发现了隐藏的问题并进行了修复。在生产环境的切换中，未发生新的问题。

### **回退方案**

#### **降级处理**

- 降级处理流程

如下图所示，是我们内部使用的服务配置中心系统，可提供主动行为的定时拉取、发布订阅、可编辑、离线文件缓存配置等等功能。从拓扑中，可以看到正常的业务读写请求会落在 TiDB 集群，然后 TiDB 集群会通过 TiDB-binlog 的下游 Kafka 模式将数据同步到 MongoDB，由 MongoDB 作为备库。

![切换前](/res/session4/chapter5/from-mongodb-to-tidb/6.png)

当遇到 TiDB 集群业务不可以访问的情况，需要通过人为手段恢复。通过可视化管理系统 MFW-Admin，通过手动变更配置信息，服务配置中心生效配置请求处理，将 Web Service 请求全部切换到 MongoDB，同时 MongoDB 会通过 Stream，下游配置 Kafka 模式将增量数据同步回 TiDB 集群。真正做到主备的应急切换。

![切换后](/res/session4/chapter5/from-mongodb-to-tidb/7.png)

- 降级处理流程的触发

我们在业务层设计了“熔断机制”，通过 RPC 调用失败次数占比来确认业务的请求是否正常处理，一旦触发“异常统计条件”，直接熔断服务。在业务侧直接返回，不再 RPC 调用远端服务。

```conf
异常统计条件：指定的时间窗口内，RPC 调用失败次数的占比，超过设定的阈值，就不再 RPC 调用，直接返回 ”降级逻辑“。
熔断参数配置：熔断器的参数
circuitBreaker.requestVolumeThreshold：//滑动窗口的大小，默认为 20
circuitBreaker.errorThresholdPercentage： //错误率，默认 50%
circuitBreaker.sleepWindowInMilliseconds： //过多长时间，熔断器再次检测是否开启，默认为 5000，即 5s 钟
含义：
每当 20 个请求中，有 50%失败时，熔断器就会断开，此时，再调用此服务，将不再调远程服务，直接返回失败。
5s 后，重新检测该触发条件，判断是否熔断器连接，或者继续保持断开。
```

降级操作是配合“熔断机制”，熔断后，不再调用远端服务器的 RPC 接口，而采用本地的回退机制，返回一个“备用方案”和“默认取值”；这个机制相对直接挂掉业务，要好一些，但也要看哪些业务场景。接下来业务隔离重试，DBA 要通过配置中心内置查询 MongoDB 和 TiDB 的开关，将 TiDB 手动切换 MongoDB 查询。切换后，因为还有增量数据同步到 TiDB 集群，可以通过 Kafka 监控来确认数据同步的延迟情况。

![kafka监控](/res/session4/chapter5/from-mongodb-to-tidb/8.png)

## **TiDB 架构**

### **关于版本**

当时部署的是 3.0.6 版本，和 TiDB 官方测试 3.0.5 和 3.0.6 悲观锁存在的潜在问题，所以升级到 3.0.9，另外我们在业务中启用的悲观锁。

![TiDB 集群配置](/res/session4/chapter5/from-mongodb-to-tidb/9.png)

在 v3.0.5 和 v3.0.6 悲观锁存在一些潜在问题，主要是 TTL 清理 和 dead lock 检测器，目前使用 该版本业务模式应该已经固定，没有发现问题[高峰 tps/1.6 万，QPS/s 8.3 万]。除非业务量出现成倍增加 ，所以官方建议升级到 v3.0.9

1. 问题概要：悲观事务 TTL 超时被清理后，客户端再提交事务会 panic（commit 时间 10min 以后）

   - 影响版本：v3.0.6，v3.0.7，master

   - 修复版本：v3.0.8，maste


2. 问题概要：悲观事务的 dead lock 检测器 

   - 问题：当有新的 peer 在死锁检测器 leader 所在节点创建时，会导致死锁检测器 leader step down，无法检测出死锁。只有 first region 的 leader 变化了才会选出新的死锁检测器 leader。

   - 影响：v3.0.3～v3.0.6 都有这个 bug，现象是 log 里有**很多** I'm not the leader of deadlock detector。会导致发生死锁时，死锁检测不到，事务会在 lock wait timeout 后 abort，大约 50s。

   - 修复：v3.0.7

### **关于 TiDB 拓扑**

因为 TiKV 的物理机配置很高，为了资源得到更好利用，所以每个主机挂载 3 块存储，通过 host label 来优化 PD 调度 region，提高集群的高可用，另外通过设置 “storage.block-cache.capacity” 参数实现单机多实例的 AutoMemory 的智能调节，优化 TiKV 的物理机的内存使用。

![单机多实例部署](/res/session4/chapter5/from-mongodb-to-tidb/10.png)

### **TiDB 的完整架构**

业务侧写请求会通过 12 个 Web Service 通过 Proxy 写入到第一层缓存 Redis Cluster，最终写入到 TiDB 集群，写入经过 Redis 前提是：判断业务每次写入数据是否大于 3000 条，大于进入队列--程序处理写入 TiDB 集群，否则直接写入 TiDB 集群，有些在线接近于实时分析，比如在线人数等功能，使用 TiDB-binlog 将数据通过 Kafka 同步到第二层缓存 Redis Cluster。业务读请求会通过 Proxy 访问 TiDB 集群，首先判断 Redis 集群是否 key-value 存在，如果有则从 Redis 返回，否则读取 TiDB 集群，根据业务场景之前的设计，比如更新金额一个字段的数据，使用更双更新[当然有判断更新失败的情况处理]，对于复杂计算 SQL，比如折扣等，直接将缓存失效，在 TiDB 侧做计算；另外 Spark 集群的实时查询会在第一层缓存中，实时扫描 Big 和 Hot  Key，是基于 Redis LFU 功能在 Spark 中实现，如果访问某个 key-value 大于 5 万次，则将该 key-value 通过程序植入基于 Spark 集群，当然有大概 3～5 分钟过期时间[根据自己的业务来定]，miss 一次，读取 TiDB，然后放入缓存。

![TiDB完整架构](/res/session4/chapter5/from-mongodb-to-tidb/11.png)

在现在的架构中，Redis 和 TiDB 混合架构保证了业务查询数据一致性，通过上文描述，可以发现我们在架构中是没有引入数据库中间件处理业务请求。因为在架构评估中，我们可以的得出该套架构成本相对数据库中间件成本较低。当然有一些不足，引入缓存层，来保证一致性，在业务请求读写数据库时，整个链路中多了一层缓存层。业内也有其他方式解决该问题，比如 sleep 和设置延迟时间来保证读写数据的一致性。

### **TiDB 的 SQL 优化**

#### **典型 SQL 优化**

MongoDB 的查询也基本都是单表，通过走索引方式查询。针对每一条改造后的 SQL 都进行了优化，使可以精确的命中最优的索引，从而实现了在几十亿数据量，TP 业务 99% 的响应时间在 15ms，99.9% 的响应时间在 700ms 内，这其中有很多的查询请求是都是 sum ... group by 的形式的。经过对于查询，尤其是聚合计算、分组查询优化后，TP 业务 99% 的响应时间在 15ms，99.9% 的响应时间在 48ms；

- 优化前

![优化前](/res/session4/chapter5/from-mongodb-to-tidb/12.png)

- 优化后

![优化后](/res/session4/chapter5/from-mongodb-to-tidb/13.png)

#### **TiDB 的并发和热点表调度优化**

- TiDB 的弹性扩容使吞吐得到很好的解决，尤其在增加 TiDB Server 节点，TPS 和 QPS 随之增加。另外批量业务场景中，预处理 DML 操作，提交性能尤佳。

- 初始化 region 分裂耗时长：raftstore cpu 和热点问题：

1. 优化表的定义与索引，表定义中不使用自增长列（自增长的 rowid）作为主键，避免大量 INSERT 时把数据集中写入单个 Region，造成写入热点。索引可以使用有实际含义的列作为主键，同时减少表不必要的索引，以加快写入的速度。

2. 对已有表的 region 进行强制分裂

  - 通过 PD control 工具找出 Region 或者 leader 数量较大的 TiKV （Store）

  ```shell
  $ /tidb-ansible/resource/bin/pd-ctl -u http://{pd-ip}: {pd-status-port} -d store | grep -A 2 store
  ``` 

  - 通过 TiDB 的 API 查找热点表和索引的 Region 分布:

  ```shell
  $curl http://{tidb-ip}:{tidb-status-port}/tables/${db_name}/${table_name}/regions
  ```

  - 使用 pd-ctl 工具 split 切分表的 region：

  ```shell
  $ /tidb-ansible/resource/bin/pd-ctl -u http://{pd-ip}: {pd-status-port} operator add split-region region_id
  ```

#### **TiDB  一体化工具**

- TiDB 的各个组件中内置 Prometheus 接口，将 Metric 数据吐给 Prometheus 时序库中，提供完整的监控、告警全流程；

- TiDB-binlog 通过 pump 服务生成 binlog，Drainer 生成增量文件或者下游 TiDB、MySQL、Kafka 支持的增量数据。

- 通过 reparo 工具将 TiDB-binlog 生成的 file 文件解析，然后我们自己清洗处理后，将指定时间的数据闪回；

- TiDB 的 SQL 优化大部分可以沿用 RDBMS 中的 SQL 优化规则，其次的学习成本就是 SQL 优化器提供的并发处理和下推处理等并发计算处理，

## **TiDB 展望**

### **关于 4.0 已经实现的需求**

- BR，提供集群数据的物理备份/恢复工具，可以高效的备份和恢复集群、库、表级别的维度；

- 大事务，提供 10GB 的大事务；

- TiDB Dashboard，热点分析定位工具，可以准确定位热点问题；

- 分区表，分区表功能和性能基本稳定；

- CDC，提供 HA 版本的 TiDB-binlog；

- 数据闪回，支持 gc 时间范围内的表级别或者行级别的数据闪回。

### **还有一些小建议和需求**

- 事务限制，能否像 MySQL MGR 事务流控方式；

- 数据热点问题自动处理；

- 客户端重试，目前客户端代码需要封装重试逻辑，对用户不友好，希望可以像 MongoDB3.6 版本，业务读写时，副本集中主切换对业务会有重试机制。

- 悲观锁，能否像 MySQL 实现隐式事务提交机制；
