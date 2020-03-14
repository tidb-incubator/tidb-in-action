## 6.4.4 TiDB 分区表问题处理

1. TiDB 4.0 Fixed 了不少普遍且重要的 Bug ，如果遇到以下问题，建议升级到最新的 GA 版本。

   * 唯一索引不能创建 [详情](https://github.com/pingcap/tidb/pull/11946)。

   * 在显式事务中查询对 Table Partition 的查询包含谓词时，查询结果不正确的问题 [详情](https://github.com/pingcap/tidb/pull/11196)：

            create table t (a int) partition by hash(a) partitions 4;
            begin
            insert into t values (0),(1);
            select * from t where a>0; 
            +---+
            | a |
            +---+
            | 1 |
            | 0 | -- Bug: filter is a>0
            +---+

   * INSERT … ON DUPLICATE 语句作用在 Table Partition 时执行失败报错的问题 [详情](https://github.com/pingcap/tidb/pull/11231)：

            create table t1 (a int,b int,primary key(a,b)) 
                partition by range(a) 
                (partition p0 values less than (100),
                 partition p1 values less than (1000)
                );
            insert into t1 set a=1,b=1;
            insert into t1 set a=1,b=1 on duplicate key update a=1,b=1;
            ERROR 1105:can not be duplicated row, due to old row not found. handle 1 not found

   * 分区表统计信息收集 Bug ，比如新增一个分区后，收集统计信息没有获取这个新分区的元数据，导致没有收集 [详情](https://github.com/pingcap/tidb/pull/12632)。
  
   * 分区表 LIMIT 没有下推，导致千兆网卡跑满，引发 TiDB Server OOM Kill [详情](https://github.com/pingcap/tidb/pull/13620)。
  
   * OR 查询引发的全表扫描。对每个 Partition 做裁剪的时候，会提取带有 Partition Column 的条件，但是 CheckScalarFunction 在判断 OR 条件时候，如果两个参数有一个不包含 Partition Column ，就会把整个条件扔掉。导致 TiDB 认为每个分区都没有需要裁剪的条件，从而选择全表扫描 [详情](https://github.com/pingcap/tidb/pull/14546)。
