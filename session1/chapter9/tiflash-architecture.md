# TiFlash 架构与原理
相比于行存，TiFlash 根据强 Schema 按列式存储结构化数据，借助 ClickHouse 的向量化计算引擎，带来读取和计算双重性能优势。相较于普通列存，TiFlash 则具有实时更新，分布式自动扩展，SI（Snapshot Isolation）隔离级别读取等优势。本章节将从架构和原理的角度来解读 TiFlash。

## 基本架构
![1.png](/res/session1/chapter9/tiflash-architecture/1.png)

TiFlash 引擎补全了 TiDB 在 OLAP 方面的短板。TiDB 可通过计算层的优化器分析，或者显式指定等方式，将部分运算下推到对应的引擎，达到速度的提升。值得一提的是，在表关联场景下，即便 TiFlash 架构没有 MPP 相关功能，借助 TiDB 的查询优化器，布隆过滤器下推和表广播等手段，相当比例的关联场景仍可享受 TiFlash 加速。

如上图所示，TiFlash 能以 Raft Learner Store 的角色无缝接入 TiKV 的分布式存储体系。TiKV 基于 Key 范围做数据分片并将一个单元命名为 Region，同一 Region 的多个 Peer（副本）分散在不同存储节点上，共同组成一个 Raft Group。每个 Raft Group 中，Peer 按照角色划分主要有 Leader、Follower、Learner。在 TiKV 节点中，Peer 的角色可按照一定的机制切换，但考虑到底层数据的异构性，所有存在于 TiFlash 节点的 Peer 都只能是 Learner（在协议层保证）。TiFlash 对外可以视作特殊的 TiKV 节点，接受 PD 对于 Region 的统一管理调度。TiDB 和 TiSpark 可按照和 TiKV 相同的 Coprocessor 协议下推任务到 TiFlash。

在 TiDB 的体系中，每个 Table 含有 Schema、Index（索引）、Record（实际的行数据） 等内容。由于 TiKV 本身没有 Table 的概念，TiDB 需要将 Table 数据按照 Schema 编码为 Key-Value 的形式后写入相应 Region，通过 Multi-Raft 协议同步到 TiFlash，再由 TiFlash 根据 Schema 进行解码拆列和持久化等操作。

## 原理
![2.png](/res/session1/chapter9/tiflash-architecture/2.png)

这是一张 TiFlash 数据同步到读取的基本流程架构图，以下将按照大类模块分别简单介绍。

### Replica Manager
Index 这种主要面向点查的结构对于 TiFlash 的列式存储是没有意义的。为了避免同步冗余数据并实现按 Table 动态增删 TiFlash 列存副本，需要借助 PD 来有选择地同步 Region。

![3.png](/res/session1/chapter9/tiflash-architecture/3.png)

在同一个集群内的 TiFlash 节点会利用 PD 的 ETCD  选举并维护一个 Replica Manager 来负责与 PD 和 TiDB 交互。当感知到 TiDB 对于 TiFlash 副本的操作后（DDL 语句），会将其转化为 PD 的 Placement Rule，通过 PD 令 TiKV 分裂出指定 Key 范围的 Region，为其添加 Learner Peer 并调度到集群中的 TiFlash 节点。此外，当 Table 的 TiFlash 副本尚未可用时，Replica Manager 还负责向各个 TiFlash 节点收集 Table 的数据同步进度并上报给 TiDB。

### Raft Learner Proxy
基于 Raft Learner 的数据同步机制是整个 TiFlash 存储体系的基石，也是数据实时性、正确性的根本保障。Region 的 Learner Peer 除了不参与投票和选举，仍要维护与其他 TiKV 节点中相同的全套状态机。因此，TiKV 被改造成了一个 [Raft Proxy](https://github.com/solotzg/tikv/tree/tiflash-proxy-master) 库，并由 Proxy 和 TiFlash 协同维护节点内的 Region，其中实际的数据写入发生在 TiFlash 侧。

作为固定存在的 Learner，TiFLash 可以进行数据进行二次加工而不用担心对其他节点产生影响。TiFlash 在执行 Raft 命令时就可以做到剔除无效数据，将未提交的数据按 Schema 预解析等优化。同时 TiFlash 实现了对于 Raft 命令的幂等回放以及引擎层的幂等写，可以不记录 WAL 且只在必要的时刻做针对性的持久化，从而简化模型并降低了风险。

TiDB 的事务实现是基于 Percolator 模型的，映射到 TiKV 中则是对 3 个 CF（Column Family） 数据的读写：Write、Default、Lock。TiFlash 也在每个 Region 内部对此做了抽象，不同的是对于 TiFlash 而言，数据写入 CF 只能作为中间过程，最终持久化到存储层需要找到 Region 对应的 Table 再根据 Schema 进行行列结构转换。

### Schema Syncer
每个 TiFlash 节点会依据特定的数据范围异步地向 TiKV 获取集群中 Table 的 Schema 信息，然后检测相关改动并应用变更到存储层。由于行存和列存的格式差异巨大，列存在应用 TiDB 的 Schema 改动时很难做到实时在线处理，对于复杂操作则需要锁表来保证正确性。

### Learner Read / Coprocessor
![4.png](/res/session1/chapter9/tiflash-architecture/4.png)

无论是通过 CH 客户端、TiSpark、CHSpark 还是 TiDB 向 TiFlash 发起查询，都需要 Learner Read 来确保外部一致性。在同一个 Raft Group 中，Index 是永续递增的（任何 Raft 命令都会对其产生修改），可被视作乐观锁。Region 本身含有 Version 和 Conf Version 两种版本号，当发生诸如 Split/Merge/ChangePeer 等操作时，版本号均会产生相应的变化。

所有的查询都需要由上层拆分为一个或多个 Region 的读请求，需要包含 Region 的两种版本号（可从 PD 或 TiKV 获取），Timestamp（用于 Snapshot Read 的时间戳，从 PD 获取），以及 Table 相关信息（Schema Version 从 TiDB 获取）。单次读请求可大致分为以下步骤：

1. 校验并更新本节点的 Schema
2. 向 Region 的 Leader Peer 获取最新的 Index，等待当前节点中 Learner 的 Applied Index 追上
3. 校对 Version 和 Conf Version，检查 Lock CF 中的锁信息
4. 读取内存中的半结构化数据和存储引擎中 Region 范围对应的结构化数据
5. 按照 Timestamp 进行 Snapshot Read 和多路合并
6. Coprocessor 计算（主要借助 ClickHouse 的向量化计算引擎）

### 存储引擎简介
以下章节部分转自 Real-Time Analytics 团队的文章[《浅析数据块排序》](https://zhuanlan.zhihu.com/p/96374849)。

目前主流的数据库引擎可按照实现方式分为以下几种：B+ Tree、LSM、Delta Main。TiFlash 有 2 款存储引擎，默认 TMT（Transaction Merge Tree）属于类 LSM 解决方案。由于相邻的数据可能落在 Memtable 以及不同的 SSTable 中，涉及到范围扫描时，需要对结构化/半结构化数据进行排序输出。因此，对于数据块排序过程的优化，也会对读性能产生重要影响。以下将介绍 TMT 引擎所用到的排序优化策略。

#### 多路合并优化
定义数据块（Mark）为内存中的有序数组，若干个无相交的数据块有序排列组成一个分区（Part），当需要对多个分区进行全局排序输出时，最朴素的方式即使用优先队列（堆）进行多路合并。如果合并的路数较少（例如只有 1 或 2 路），则可以实现特化版本以减少分支和堆操作，以获得更好的局部性。

如下图所示，part-1.mark-1 与 part-2.mark-1 之间没有重叠，理论上可以直接输出 part-1.mark-1 从而跳过频繁操作排序堆。本文称这类优化为跳段优化。

<p align="center">
<img src="/res/session1/chapter9/tiflash-architecture/5.png" x height="450">
</p>

#### 磁盘存储相关优化
在实际的类 LSM 引擎中，数据源主要都存于磁盘的 SSTable 之中，少量存在于内存的 Memtable 之上。针对以上的排序案例，需要考虑磁盘操作对整体负载的影响，主要在于以下几点：

* 读盘与计算之间需要做异步，避免 CPU 和 IO 设备互相等待
* 流式数据读取和操作，避免内存爆炸
* 分段策略的数据边界预读

可以令每一个 Mark 由最多包含 N 行（N 为不可变值，例如8K）数据，每 M 个 Mark 形成作为数据压缩的最小单元。Part 中以 Mark 为单位构建粗索引并持久化，例如：每个 Mark 的最小值，整个 Part 的最大/小值等。

引入流算子机制，例如读盘算子每读 N 行数据则向上输出，多个读盘算子可成为一个多路合并算子的输入，并照此不断衔接。每个算子都要尽可能合理控制 读取->处理->输出 这 3 个步骤的数据批大小，以达到更好的 Pipline 效果。SSTable 按列格式存储，不仅便于同数据簇批处理和拷贝，选择适当的压缩算法和缓存机制也能取得更好的压缩比和 IO 效果。

#### 多版本并发控制优化
多版本并发控制（MVCC）是实现数据库引擎更新功能的重要途径。TiDB 中的每一条行存数据能在 TiFlash 中以 <key, value> 形式来表示，key 实际可以被拆解为 3 部分 {handle, version, delmark} 依次代表 key 比较的排序键。其中，handle 代表该行数据的唯一索引，version 代表其在不同时刻被修改所对应的版本号（在 TiDB 的体系中为一个 64 位无符号整型），若修改为删除操作则 delmark 为 1，否则为 0。基于此，TiFlash 在实际的磁盘存储结构中，除了 value 需要根据 Schema 拆分出的列外，还多出了 3 个 key 相关的隐藏列。

令 HandleRange 代表 key 值域是 [start, end) 的一段数据，如果一个查询请求包含一组 HandleRange（彼此互不相交且空间占用相对一致），一个特定的版本号 V。该如何找出这些 HandleRange 对应范围内的所有数据 Snapshot Read 后的结果？解决方案大致如下：

* 将 HandleRange 排序后按核数分组，每组由单核处理。考虑到底层数据通常是压缩存储的，需要合并组内相邻的 HandleRange 转化为多个大范围查询以减少冗余数据读取
* 对于每个范围查询，需要先过滤一遍粗索引，二分定位到相关的 Mark 并构成数据流。然后在此基础上添加范围过滤算子来细粒度地清除无效数据。其后是版本过滤算子用以去掉版本号大于 V 的数据。最后将多个版本过滤算子输入到一个多路合并算子
* 多路合并算子可以结合上述排序优化算法，找到每个 handle 最终对应的版本号并根据其是否被删除输出结果

<p align="center">
<img src="/res/session1/chapter9/tiflash-architecture/7.png" x height="500">
</p>

图中为上述步骤的大致流程，有几个细节可以优化：

* 因为版本号为整型数据，版本过滤算子可以实现乐观检测的优化，即利用 SIMD 快速判断当前批次数据的版本号是否都小于等于 V
* 当多路合并算子在做跳段时，也可以乐观检测一段数据的 handle 是否完全不同且 delmark 全都是 0，这样就能直接输出到上层算子
* 当数据分布较为糟糕时，以上几个算子可以压缩成一个，使用较为朴素的方式以减少流算子间数据拷贝的开销

## TiFlash 对 OLAP 查询加速
OLAP 类的查询通常具有以下几个特点：

* 每次查询读取大量的行，但是仅需要少量的列
* 宽表，即每个表包含着大量的列
* 查询通过一张或多张小表关联一张大表，并对大表上的列做聚合

TiFlash 列存引擎针对这类查询有较好的优化效果：

I/O 优化

* 每次查询可以只读取需要的列，减少了 I/O 资源的使用
* 同列数据类型相同，相较于行存可以获得更高的压缩比
* 整体的 I/O 减少，令内存的使用更加高效

CPU 优化

* 列式存储可以很方便地按批处理字段，充分利用 CPU Cache 取得更好的局部性
* 利用向量化处理指令并行处理部分计算
 
### TiKV 与 TiFlash 配合
TiFlash 可被当作列存索引使用，获得更精确的统计信息。对于关联查询来说，点查相关的任务可以下推到 TiKV，而需要关联的大批量聚合查询则会下推到TiFlash，通过两个引擎的配合，达到更快的速度。

## 总结与展望

TiFlash 是分布式列存引擎的一大里程碑，也是 TiDB 的 HTAP 之路上的全新实践。这套架构体系也将伴随生产环境的使用不断演化发展，进而为用户解决更多问题。
