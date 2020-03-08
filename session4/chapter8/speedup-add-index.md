# 8.3.2 动态调整新增索引速度

由于添加索引在扫表回填索引的时候会消耗性能，甚至在一些频繁跟新的字段上会发生冲突导致TiDB集群受到影响，在大表加索引的过程往往持续时间会很长，所以尽可能的平衡添加时间和性能关系。目前TiDB提供了四个参数可以调整索引添加速度。

| 参数   | 默认值   | 说明   | 
|:----|:----|:----|
| tidb_ddl_reorg_worker_cnt   | 16   | 控制添加索引并发度   | 
| tidb_ddl_reorg_batch_size   | 1024   | 控制每次添加索引数据的数量   | 
| tidb_ddl_reorg_priority   | PRIORITY_LOW   | 调整添加索引优先级。参数有PRIORITY_LOW/PRIORITY_NORMAL/PRIORITY_HIGH   | 
| tidb_ddl_error_count_limit     | 512   | 失败重试次数，如果超过该次数添加索引会失败   | 

TiDB主要使用tidb_ddl_reorg_worker_cnt和tidb_ddl_reorg_batch_size参数来动态调整参数，通常来说设置的值越小对系统影响越小，但是执行时间越长。如果保守起见，可以先将值调到4和256。执行之后可以观察系统QPS，系统延时等参数，逐渐调大线程，先到16。如果系统没有发生明显的抖动，再调高tidb_ddl_reorg_batch_size，该如果索引涉及的列频繁更新就会造成大量冲突导致失败重试。

添加索引的速度评估使用admin show ddl查询RowCount字段，了解目前ddl已经更新了的行数，再使用show stats_meta查看Row_count字段了添加索引的表有几行，根据当前已经更新的时间和更新行数比例粗略评估剩下多少更新时间，再次进行动态参数的调整。

通常来说：1、为更新不频繁的字段添加索引，对系统影响比较小可以使用默认配置。2、如果为更新频繁的字段添加索引可以调整到4和256确保系统正常稳定的运行。可以查看[添加索引和负载测试](https://pingcap.com/docs-cn/stable/benchmark/add-index-with-load/#%E6%B5%8B%E8%AF%95%E6%96%B9%E6%A1%88-1-add-index-%E7%9B%AE%E6%A0%87%E5%88%97%E8%A2%AB%E9%A2%91%E7%B9%81-update)


