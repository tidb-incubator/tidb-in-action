# 6.1 业务开发最佳实践

在使用 TiDB 进行业务开发的时候，由于其自身的特点，有许多跟传统单机数据库不同的地方。本章节结合用户实际使用过程中的经验，总结了一些在使用 TiDB 过程中最佳实践。

* [乐观锁模式下的事务最佳实践](avoid-optimistic-lock-conflicts.md) 
* [TiDB 中事务限制及应对方案](transaction-statement-count-limit.md) 
* [高并发的唯一序列号生成方案](serial-number.md) 
* [一种高效分页批处理方案](page-inaction.md) 
* [通过 hint 调整执行计划](tidb-hint.md) 
* [SQL 调优案例](sql-optimization-cases.md) 
* [TiDB + TiSpark 跑批最佳实践](batch-tasks-best-practices.md) 
