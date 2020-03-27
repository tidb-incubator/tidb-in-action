## 3.1 表中所有数据和 Key-Value 的映射关系

本小节为大家介绍 TiDB 表中的数据和 (Key, Value) 键值对的映射关系。众所周知，TiKV 提供的是基于 (Key, Value) 键值对的存储引擎。表的一行数据包含了多列，在存储的时候选择哪些列作为 Key，哪些列作为 Value 是一个非常有意思的问题，在这一点上不同的数据库有着不同的映射方式，比如 Google F1 中 Value 存储的是每一行中一列的数据，这一点和将要介绍的 TiDB 的映射方式非常不同。

### 3.1.1 选择映射关系的一些考虑

对于一个 Table 来说，需要存储的数据包括三部分：

1. 表中每一行的数据，以下简称表数据
2. 表中所有索引的数据，以下简称索引数据
3. 表的元信息

对于表中每一行的数据，既可以选择行存也可以选择列存，两者各有优缺点，分别适用于不同的场景。TiDB 的首要目标是 OLTP 业务，要满足这类业务的需求，数据库需要支持快速的针对单行或者某些行的增、删、改、查等操作，所以 TiKV 的行存是比较合适该场景的。从 TiDB 3.1 开始（包括 TiDB 4.0），为了能够满足用户复杂的实时分析场景，TiDB 提供了一个叫做 TiFlash 的列存引擎，它提供了列式的存储模式和快速的分析能力。列存的映射关系比较简单，这里暂且不表述。

再来看看索引数据，TiDB 同时支持主键和二级索引（包括唯一索引和非唯一索引）。在 OLTP 场景下，好的索引能够极大的提升 SQL 查询的性能，降低集群的整体负载。

除了需要考虑待存储数据的特点，还需要关注如何方便对所存储数据进行操作，主要考虑 `Insert`/`Update`/`Delete`/`Select` 这四种语句：

1. 对于 `Insert` 语句，既需要将表数据写入 KV 存储，也需要构造和存储对应的索引数据。
2. 对于 `Update` 语句，需要在更新表数据的同时，也更新对应的索引数据（如果有必要的话）。
3. 对于 `Delete` 语句，需要在删除表数据的同时，也删除对应的索引数据（如果有必要的话）。
4. 对于 `Select` 语句，情况会复杂一些。用户希望数据库提供快速读取一行数据的能力，所以每行表数据最好有一个唯一 ID （显示或隐式的 ID）方便快速读取。其次用户也可能会连续地读取多行数据，比如 `select * from user`。最后还有通过索引读取数据的需求，对索引的使用可能是基于唯一索引或者主键的等值查询（业界常说的“点查”）或者是范围查询。

TiDB 采用了一个全局有序的分布式 Key-Value 引擎（TiKV）。对于快速获取一行数据，假设能够构造出某一个或者某几个 Key，定位到这一行，就能利用 TiKV 提供的 `Seek()` 方法快速定位到这一行数据所在位置。再比如对于 TiKV 上扫描全表的需求，如果能够映射为一个 Key 的范围，从开始 Key 扫描到结束 Key，那么就可以简单的通过这种方式获得全表数据。操作索引数据也是类似的思路。当然，在有了 TiFlash 以后，全表扫更适合在 TiFlash 上进行，因为列式存储的优势，这种场景中它能提供更快的读取性能。

### 3.1.2 每行数据和 Key-Value 的映射关系

基于上一小节的考虑：

1. TiDB 对每个表都会分配一个表 ID，用 `TableID` 表示。表 ID 是一个整数，在整个集群内唯一。
2. TiDB 为表中每行数据分配了一个行 ID，用 `RowID` 表示。行 ID 也是一个整数，在表内唯一。对于行 ID，TiDB 做了一个小优化，如果某个表有整数型的主键，TiDB 会使用主键的值当做这一行数据的行 ID。

每行数据按照如下规则编码成 (Key, Value) 键值对：

```
Key:   tablePrefix{TableID}_recordPrefixSep{RowID}
Value: [col1, col2, col3, col4]
```

其中 `tablePrefix` 和 `recordPrefixSep` 都是特定的字符串常量，用于在 Key 空间内区分其他数据。后面的小结将会介绍它们的具体的值是什么。

### 3.1.3 索引数据和 Key-Value 的映射关系

同样的，TiDB 为表中每个索引分配了一个索引 ID，用 `IndexID` 表示。在 TiDB 中，不管是主键还是二级索引，总的来说有两种到 Key-Value 的映射方法。

对于需要满足唯一性约束的主键或者唯一索引，按照如下规则编码成  (Key, Value) 键值对：

```
Key:   tablePrefix{tableID}_indexPrefixSep{indexID}_indexedColumnsValue
Value: RowID
```

对于不需要满足唯一性约束的普通二级索引，按照如下规则编码成  (Key, Value) 键值对：

```
Key:   tablePrefix{TableID}_indexPrefixSep{IndexID}_indexedColumnsValue_{RowID}
Value: null
```

### 3.1.4 映射关系小结

最后，上述所有编码规则中 Key 里面的 `tablePrefix`，`recordPrefixSep` 和 `indexPrefixSep` 都是字符串常量，用于在 Key 空间内区分其他数据，定义如下：

```
tablePrefix     = []byte{'t'}
recordPrefixSep = []byte{'r'}
indexPrefixSep  = []byte{'i'}
```

另外请注意，上述方案中，无论是表数据还是索引数据的 Key 编码方案，一个表内所有的行都有相同的 Key 前缀，一个索引的所有数据也都有相同的前缀。这样具有相同的前缀的数据，在 TiKV 的 Key 空间内，是排列在一起的，只要小心地设计后缀部分的编码方案，保证编码前和编码后的比较关系不变，那么就可以将表数据或者索引数据有序地保存在 TiKV 中。采用这种编码后，一个表的所有行数据会按照 `RowID` 顺序地排列在 TiKV 的 Key 空间中，某一个索引的数据也会按照索引数据的具体的值（编码方案中的 `indexedColumnsValue` ）顺序地排列在 Key 空间内。

### 3.1.5 Key-Value 映射关系的一个例子

最后通过一个简单的例子，来理解 TiDB 的 Key-Value 映射关系。假设 TiDB 中有如下这个表：

```sql
CREATE TABLE User {
	ID int,
	Name varchar(20),
	Role varchar(20),
	Age int,
	PRIMARY KEY (ID),
	KEY idxAge (Age)
};
```

假设该表中有 3 行数据：

```
1, "TiDB", "SQL Layer", 10
2, "TiKV", "KV Engine", 20
3, "PD", "Manager", 30
```

首先每行数据都会映射为一个 (Key, Value) 键值对，同时该表有一个 `int` 类型的主键，所以 `RowID` 的值即为该主键的值。假设该表的 `TableID` 为 10，则其存储在 TiKV 上的表数据为：

```
t10_r1 --> ["TiDB", "SQL Layer", 10]
t10_r2 --> ["TiKV", "KV Engine", 20]
t10_r3 --> ["PD", "Manager", 30]
```

除了主键外，该表还有一个非唯一的普通二级索引 `idxAge`，假设这个索引的 `IndexID` 为 1，则其存储在 TiKV 上的索引数据为：

```
t10_i1_10_1 --> null
t10_i1_20_2 --> null
t10_i1_30_3 --> null
```

希望通过上面的例子，读者可以更好的理解 TiDB 中关系模型到 Key-Value 模型的映射规则以及选择该方案背后的考量。
