## 6.4.3 TiDB 分区表最佳实践

* 当业务写入数据有问题，想清理某个分区数据时，不用批量的 DELETE 数据，可以通过TRUNCATE 命令直接清理分区：

    `ALTER TABLE employees_attendance TRUNCATE PARTITION p20200306;`

* TiDB 表的统计信息可能不准确，然而 SQL 会因为统计信息准确而选错索引导致 SQL 性能问题，但是如果整个表太大，收集全表的时间太长，解决不了当时的慢 SQL 问题，比如：对于一些按天/周/月度销售额度数据。此时，可以只对 SQL 中用到的分区进行统计信息收集：

    `ALTER TABLE employees_attendance ANALYZE PARTITION p20200306;`

* 可以使用分区表函数来简化运维，有的程序会用时间戳来存储时间， DBA 再创建新分区时还需要将日期转换时间戳，然后再建立分区。为了避免麻烦，可以使用 TiDB 支持的函数 UNIX_TIMESTAMP 来搞定：
  
    `ALTER TABLE ADD PARTITION p20200306 VALUES LESS THAN (UNIX_TIMESTAMP('2020-03-07'))`

    关于 TiDB 支持的可以用于分区表达式的函数，详情见[函数](https://pingcap.com/docs-cn/v3.1/reference/sql/partitioning/)

* Range 分区中 MAXVALUE 表示一个比所有整数都大的整数。避免 Data Maintance 脚本问题导致的分区没有创建从而影响业务写入，详情可见上面例子。

* Hash 分区使用：最高效的 Hash 函数是作用在单列上，并且函数的单调性是跟列的值是一样递增或者递减的，因为这种情况可以像 Range 分区一样裁剪。不推荐 Hash 分区在表达式中涉及多列。

* 分区表有损调整字段 ( TiDB 默认不支持有损更新 ) ，可以通过创建新字段列，将原列的值 UPDATE 到新列，然后 DROP 原字段的方式实现。
