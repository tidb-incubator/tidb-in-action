# 8.3.2 动态调整新增索引速度


由于新增索引在扫表回填索引的时候会消耗部分资源，甚至与一些频繁更新的字段会发生冲突导致正常业务受到影响。大表新增索引的过程往往会持续很长时间，所以要尽可能地平衡持续时间和集群性能之间的关系。  
目前 TiDB 提供了四个参数可以调整索引新增速度。

| 参数 | 默认值 | 说明 |
| :------------------------- | :----------- | :----------------------------------------------------------- |
| tidb_ddl_reorg_worker_cnt | 4 | 控制新增索引并发度 |
| tidb_ddl_reorg_batch_size | 256 | 控制每次新增索引数据的数量 |
| tidb_ddl_reorg_priority | PRIORITY_LOW | 调整新增索引优先级。参数有 PRIORITY_LOW/PRIORITY_NORMAL/PRIORITY_HIGH |
| tidb_ddl_error_count_limit | 512 | 失败重试次数，如果超过该次数新增索引会失败 |

  
目前主要使用 `tidb_ddl_reorg_worker_cnt` 和 `tidb_ddl_reorg_batch_size` 这两个参数来动态调整索引新增速度，通常来说它们的值越小对系统影响越小，但是执行时间越长。保守起见，可以先将值保持为默认的 4 和 256 ，执行之后再观察系统资源使用情况、响应速度等，再逐渐调大 `tidb_ddl_reorg_worker_cnt` ，如果系统没有发生明显的抖动，再逐渐调大 `tidb_ddl_reorg_batch_size` 参数，但如果索引涉及的列更新很频繁的话就会造成大量冲突造成失败重试。  
另外还可以通过调整 `tidb_ddl_reorg_priority` 为 PRIORITY_HIGH 来让创建索引的任务保持高优先级来影响速度，但在通用 OLTP 系统上，一般建议保持默认。   

评估添加索引的速度使用 `admin show ddl` 命令来查询 RowCount 和 START_TIME 字段，记录当前 ddl 已经更新了的行数 r1 ，利用开始时间计算出已执行时间 t1 。再使用 `show stats_meta` 命令来查看 Row_count 字段，查看表数据的总行数 r0 。此时就可以用：t1/(r1/r2) - t1 来估算剩余执行时间，再根据系统资源及响应速度来评估是否再继续动态调整参数。  

通常来说：  
1、为更新不频繁的字段新增索引，对系统影响比较小可以使用默认配置。  
2、如果为更新频繁的字段新增索引可以调整到 4 和 256 确保系统正常稳定的运行，可以查看[添加索引和负载测试](https://pingcap.com/docs-cn/stable/benchmark/add-index-with-load/#%E6%B5%8B%E8%AF%95%E6%96%B9%E6%A1%88-1-add-index-%E7%9B%AE%E6%A0%87%E5%88%97%E8%A2%AB%E9%A2%91%E7%B9%81-update)。
