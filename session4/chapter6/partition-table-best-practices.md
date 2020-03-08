# 6.4 分区表实践及问题处理

随着数据表存储的数据量越来越大，有时会超过亿或者百亿级别，对于这些大表的历史数据删除需求时，特别的不方便，如果采用 delete 语句来删除的话，一是可能会线上正常业务造成影响，二是删除的速度太慢，针对这些问题，分区表应运而生，大家比较熟悉的就是基于时间维度的 Range 分区表，可以通过对分区的 DDL 操作来快速的删除数据，提高了处理数据的效率，避免了对线上业务的影响。

## 6.4.1 TiDB分区表简介

TiDB 是从 2.1 版本开始支持分区表， 3.0 版本开始成熟使用，最新的 4.0 版本在 BUG FIXED 以及分区裁剪方面都做了增强和优化。

1. TiDB分区表支持的分区类型

	目前当前支持的类型包括 Range 分区和 Hash 分区，不支持  MySQL 的 List 分区和 Key 分区。
	
	Range 分区是指将数据行按分区表达式计算的值都落在给定的范围内，在 Range 分区中必须为每个分区指定值的范围，并且不能有重叠，通过使用 VALUES LESS THAN 操作进行定义，目前只支持单列的 Range 分区表。
	
	Hash 分区主要用于保证数据均匀地分散到一定数量的分区里面。在 hash 分区中，你只需要指定分区的数量。使用 hash 分区时，需要在 CREATE TABLE 后面添加 PARTITION BY HASH (expr) PARTITIONS num ，其中 expr 是一个返回整数的表达式。当这一列的类型是整数类型时，它可以是一个列名，其中 num 是一个正整数，表示将表划分多少分区。

2. 约束和限制

	* 建表限制：建立主键和唯一键时必须包含分区表达式中用到的所有列，以 Range 分区举例说明：

			CREATE TABLE employees_attendance  (
		    	id INT NOT NULL AUTO_INCREMENT,
		    	uid INT NOT NULL,
		    	name VARCHAR(25) NOT NULL,
		    	login_date date NOT NULL,
		    	create_time timestamp NOT NULL COMMENT '打卡时间',
		    	type tinyint NOT NULL DEFAULT '0' COMMENT '0:上班，1：下班',
		    	PRIMARY KEY (`id`,`login_date`),
		  		UNIQUE KEY `idx_attendance` (`uid`,`login_date`,`type`)
			)
			PARTITION BY RANGE COLUMNS(login_date)  (
		    	PARTITION p20200306 VALUES LESS THAN ('20200307'),
		    	PARTITION p20200307 VALUES LESS THAN ('20200308'),
		    	PARTITION pmax VALUES LESS THAN MAXVALUE
			);
	上表中主键和唯一健中都包括了分区 login_date 字段，否则就会报如下的错误：
	> ERROR 1503 (HY000): A (PRIMARY KEY/UNIQUE INDEX) must include all columns in the table's partitioning function

	* 分区管理和使用方面限制

		只要底层实现可能会涉及数据挪到的操作，TiDB 目前都暂不支持。包括且不限于：调整 Hash 分区表的分区数量，修改 Range 分区表的范围，合并分区，交换分区等。
		
		使用限制: load data 不支持指定分区 load ，例如：
		`load local data infile "xxx" into t partition (p1)`
3. TiDB 4.0 对分区表的优化点

	TiDB 4.0 的版本对分区表进行了较多的 BUG 、功能增强和性能提升，主要有以下几个方面：
	
	* 稳定性：修复了很多 BUGS 
	
	*  易用性提升：例如支持 INFORMATION_SCHEMA.PARTITION 表， 运维人员一般都会基于这个表来获取分区表信息，然后再创建新分区和删除老分区。
	*  性能提升：
	
		主要在2方面的性能提升，一是分区裁剪的优化，所谓分区裁剪就是不需要扫描那些匹配不上的分区；二是点查优化，下面分别对 Range 和 hash 分区表做的具体优化进行说明：
		
		对于 Range partition 在当前的 expression 框架下，做分区裁剪不太高效，以前做裁剪的计算过程会生成很多中间表达式，计算效率低。 现在基本直接绕开了 expression ，只有常量比较操作，直接可以基于 int 比较，以前每次每个 partition 都会 constant propagate，现在只 constant propagate 一次，只把符合 pattern 的 expr 选出来，从而提升了range partition的性能。
		
		在 4.0 之前的 hash partition，以前实现是转成 range 实现的，其主要的问题是表达式计算的开销很大，而且会随着 partition 的增多，开销线性增长。
		在经过优化之后，hash partition会根据给出的查询条件，直接对分区表达式进行求值，而不是转化成 range partition。这样只经过一次表达式求值就可以算出分区。同时，优化之后的 hash partition 也支持了 PointGet 查询计划。对于只有一列且包含在唯一索 引中的的 hash partition 表达式，例如 partition by hash(id)，id 是唯一索引中的一列，会使用 PointGet 作为查询计划。优化后的 hash partition 只支持非常简单的表达式计算，最好只用一列作为 hash partition 的 表达式，可以减少表达式计算的开销，从而提升性能。

## 6.4.2 TiDB分区表使用场景


对于业务来讲，在大数据量(至少过千万)，并且表数据选择性查询，使用分区表的场景如下：

* Range 分区可以用于解决业务中大量删除带来的性能问题，支持快速删除分区，TiDB 4.0虽然事务限制放开，但是 delete 数据还是没有直接 ddl 这种直接删除底层的 ssl 文件来更快速。

* 使用 Hash 分区表来一定程度上解决写热点问题：Hash 分区则可以用于大量写入场景下的数据打散。

* 对于业务透明，避免了分库分表，还是操作一张表，只不过通过分区表的方式将数据分布到不同分区，也能在一定程度上保证 SQL 性能。

* 运维管理便利，可以单独维护具体分区。

* 典型场景举例：
	
	商业数据分析场景：经常有一些按时间实时写入的广告的点击/曝光日志，用户账户实时消费报表，指标数据实时监控表。因为数据量较大，TiDB 中可以选择保留一个月或者半年，业务程序经常会访问当天分时数据统计，同比上个月的当天，以及去年当天的数据，这个时候只需要根据时间字段创建 Range 分区表，对于以上的需求，只需要访问 3 个分区就可以快速实现统计，因为分区裁剪功能避免了扫描其他分区数据。
	
	审核业务：审核日志表这些都可以按天做 Range 分区。审核 log 表数据用来统计分析每个审核人员的工作量，可以用作绩效等方面的参考。
	
	基础信息业务：比如一些账户表。由于用户信息太庞大了，并没有明显可以分区的特征字段。可以根据表中 bigint 类型的 uid 字段做 hash 分区，结合分区时配置的分区数量，这样可以把uid打散到不同的分区，HASH 分区只能针对整数进行 HASH ，从而提高查询的性能。


## 6.4.3 TiDB分区表最佳实践

* 当业务写入数据有问题，想清理某个分区数据时，不用批量的 delete 数据，可以通过TRUNCATE命令直接清理分区： 
	`ALTER TABLE employees_attendance TRUNCATE PARTITION p20200306;`
	
* TiDB 表的统计信息可能不准确，然而SQL会因为统计信息准确而选错索引导致SQL性能问题，但是如果整个表太大，收集全表的时间太长，解决不了当时的慢 SQL 问题，比如：对于一些按天/周/月度销售额度数据。只对 SQL 中用到的分区进行统计信息收集。
	`ALTER TABLE employees_attendance ANALYZE PARTITION p20200306;`
	
* 可以使用分区表函数来简化运维，有的程序会用时间戳来存储时间， DBA 再创建新分区时还需要将日期转换时间戳，然后再建立分区，为了避免麻烦，可以使用 TiDB 支持的函数 UNIX_TIMESTAMP 来搞定：
	`ALTER TABLE ADD PARTITION p20200306 VALUES LESS THAN (UNIX_TIMESTAMP('2020-03-07'))`
	关于 TiDB 支持的可以用于分区表达式的函数，详情见[函数](https://pingcap.com/docs-cn/v3.1/reference/sql/partitioning/)
	
* Range 分区中 MAXVALUE 表示一个比所有整数都大的整数。避免 data maintance 脚本问题导致的分区没有创建从而影响业务写入，详情可见上面例子。
	
* Hash 分区使用：最高效的 hash 函数是作用在单列上，并且函数的单调性是跟列的值是一样递增或者递减的，因为这种情况可以像 Range 分区一样裁剪。不推荐 hash 分区在表达式中涉及多列。
	
* 分区表有损调整字段( TiDB 默认不支持有损更新)，可以通过创建新字段列，将原列的值  update 到新列，然后 drop 原字段。

## 6.4.4 TiDB分区表问题处理

1. TiDB 4.0 fix 了不少普遍且重要的 BUG ，如果遇到以下问题，建议升级到最新的 GA 版本

	* 唯一索引不能创建[详情](https://github.com/pingcap/tidb/pull/11946)
	
	* 在显式事务中查询对 Table Partition 的查询包含谓词时，查询结果不正确的问题 [详情](https://github.com/pingcap/tidb/pull/11196)
	
			create table t (a int) partition by hash(a) partitions 4;
			begin
			insert into t values (0),(1);
			select * from t where a>0; 
			+---+
			| a |
			+---+
			| 1 |
			| 0 | --BUG: filter is a>0
			+---+
	* INSERT … ON DUPLICATE 语句作用在 Table Partition 时执行失败报错的问题 [详情](https://github.com/pingcap/tidb/pull/11231)

			create table t1 (a int,b int,primary key(a,b)) 
				partition by range(a) 
				(partition p0 values less than (100),
				 partition p1 values less than (1000)
				);
			insert into t1 set a=1,b=1;
			insert into t1 set a=1,b=1 on duplicate key update a=1,b=1;
			ERROR 1105:can not be duplicated row, due to old row not found. handle 1 not found
	* 分区表统计信息收集 BUG ，比如新增一个分区后，收集统计信息没有获取这个新分区的元数据，导致没有收集 [详情](https://github.com/pingcap/tidb/pull/12632)
	* 分区表 limit 没有下推，导致千兆网卡跑满，引发 TiDB Server OOM kill。[详情](https://github.com/pingcap/tidb/pull/13620)
	* OR查询引发的全表扫描。对每个 parition 做裁剪的时候，会提取带有 parition column 的条件，但是 checkScalarFunction 在判断 or 条件时候，如果两两个参数有一个不包含 partition column ，就会把整个条件扔掉。导致 tidb 认为每个分区都没有需要裁剪的条件，从而选择全表扫描[详情](https://github.com/pingcap/tidb/pull/14546)	
	




	

