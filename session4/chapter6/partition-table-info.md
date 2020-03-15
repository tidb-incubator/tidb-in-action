## 6.4.1 TiDB 分区表简介

TiDB 是从 2.1 版本开始支持分区表，3.0 版本开始成熟使用，最新的 4.0 版本做了一些 Bug 修复和分区裁剪方面的增强和优化。

### 6.4.1.1 分区类型

当前支持的类型包括 Range 分区和 Hash 分区，不支持 MySQL 的 List 分区和 Key 分区。

Range 分区是指将数据行按分区表达式计算的值都落在给定的范围内。在 Range 分区中，你必须为每个分区指定值的范围，并且不能有重叠，通过使用 VALUES LESS THAN 操作进行定义。目前只支持单列的 Range 分区表。

Hash 分区主要用于保证数据均匀地分散到一定数量的分区里面。在 Hash 分区中，你只需要指定分区的数量。使用 Hash 分区时，需要在 CREATE TABLE 后面添加 PARTITION BY HASH (expr) PARTITIONS num ，其中：expr 是一个返回整数的表达式，它可以是一个列名，但这一列的类型必须整数类型；num 是一个正整数，表示将表划分为多少个分区。

### 6.4.1.2 约束和限制

#### 1. 建表限制

建立主键和唯一键时必须包含分区表达式中用到的所有列，以 Range 分区举例说明：
```
CREATE TABLE employees_attendance  (
    id INT NOT NULL AUTO_INCREMENT,
    uid INT NOT NULL,
    name VARCHAR(25) NOT NULL,
    login_date date NOT NULL,
    create_time timestamp NOT NULL COMMENT '打卡时间',
    type tinyint NOT NULL DEFAULT '0' COMMENT '0:上班，1:下班',
    PRIMARY KEY (`id`,`login_date`),
    UNIQUE KEY `idx_attendance` (`uid`,`login_date`,`type`)
)
PARTITION BY RANGE COLUMNS(login_date)  (
    PARTITION p20200306 VALUES LESS THAN ('20200307'),
    PARTITION p20200307 VALUES LESS THAN ('20200308'),
    PARTITION pmax VALUES LESS THAN MAXVALUE
);
```

上表中主键和唯一键中都包括了分区 login_date 字段，否则就会报如下错误：
```
> ERROR 1503 (HY000): A (PRIMARY KEY/UNIQUE INDEX) must include all columns in the table's partitioning function
```

#### 2. 分区管理和使用方面的限制

只要底层实现可能会涉及数据挪动的操作，TiDB 目前都不支持。包括且不限于：调整 Hash 分区表的分区数量；修改 Range 分区表的范围；合并分区；交换分区等。

使用方面的限制主要指 Load Data 不支持指定分区 load，例如：
```
load local data infile "xxx" into t partition (p1);
```

### 6.4.1.3 TiDB 4.0 对分区表的优化

TiDB 4.0 版本对分区表进行了较多的 Bug 修复、功能增强和性能提升，主要有以下几个方面：

* 稳定性提升，修复了很多 Bug

* 易用性提升，譬如支持 `INFORMATION_SCHEMA.PARTITION` 表， 运维人员一般都会基于这个表来获取分区表信息，然后再创建新分区和删除老分区

* 性能提升，主要有两方面：

  * 分区裁剪的优化，所谓分区裁剪就是不需要扫描那些匹配不上的分区

  * 点查优化，下面分别对 Range 和 Hash 分区表做的具体优化进行说明：

    * 对于 Range Partition，在当前的 Expression 框架下，做分区裁剪不太高效，以前做裁剪的计算过程会生成很多中间表达式，计算效率低。现在基本绕开了 Expression，只有常量比较操作可以直接基于 int 比较，以前每个 Partition 都会 Constant Propagate，现在只 Constant Propagate 一次，只把符合 Pattern 的 Expr 选出来，从而提升 Range Partition 的性能。

    * 4.0 版本之前的 Hash Partition 是转成 Range 来实现的，主要的问题是表达式计算的开销很大，而且随着 Partition 的增多，开销会线性增长。在经过优化之后，Hash Partition 会根据给出的查询条件直接对分区表达式进行求值，而不是转化成 Range Partition，这样只经过一次表达式求值就可以算出分区。同时，优化之后的 Hash Partition 也支持了 PointGet 查询计划，对于只有一列且包含在唯一索引中的的 Hash Partition 表达式，例如 `partition by hash(id)`（id 是唯一索引中的一列），会使用 PointGet 作为查询计划。优化后的 Hash Partition 只支持非常简单的表达式计算，最好只用一列作为 Hash Partition 的表达式，可以减少表达式计算的开销，从而提升性能。

