# Summary

* [推荐序](PREFACE.md)

## TiDB 入门与指南

* [1 TiDB 简介](chapter1/tidb-intro.md)
    * [1.1 TiDB 整体架构](chapter1/tidb-architecture.md)
    * [1.2 说存储](chapter1/tidb-storage.md)
    * [1.3 说计算](chapter1/tidb-computing.md)
        * [1.3.1 统计信息](chapter1/tidb-statistics.md)
        * [1.3.2 字符集和排序规则](chapter1/tidb-charset-collation.md)
    * [1.4 说调度](chapter1/tidb-scheduling.md)
        * [1.4.1 空间均衡](chapter1/region-balance.md)
        * [1.4.2 负载均衡](chapter1/load-balance.md)
        * [1.4.3 弹性调度](chapter1/elastic-scheduling.md)
* [2 系统安装部署与管理](chapter2/deployment-management.md)
    * [2.1 TiUP & TiOps](chapter2/tiup-tiops.md)
        * [2.1.1 TiUP 简介](chapter2/tiup-intro.md)
        * [2.1.2 用 TiUP 部署本地测试环境](chapter2/tiup-playground.md)
        * [2.1.3 用 TiUP 部署生产环境集群](chapter2/tiup-deployment.md)
        * [2.1.4 TiOps 简介](chapter2/tiops-intro.md)
        * [2.1.5 TiOps 部署生产环境集群](chapter2/tiops-deployment.md)
    * [2.2 TiDB on Kubernetes](chapter2/tidb-on-k8s.md)
        * [2.2.1 TiDB-Operator 简介](chapter2/tidb-operator-intro.md)
        * [2.2.2 TIDB-Operator 部署本地测试集群（基于 Kind）](chapter2/tidb-oprator-local-deployment.md)
        * [2.2.3 用 TiDB-Operator 部署生产环境集群](chapter2/tidb-operator-deployment.md)
    * [2.3 集群扩容缩容](chapter2/tidb-scale.md)
        * [2.3.1 基于 TiOps 的集群扩缩容](chapter2/tiops-scale.md)
        * [2.3.2 基于 TiDB-Operator 的集群扩缩容](chapter2/tidb-operator-scale.md)
    * [2.4 集群版本升级](chapter2/tidb-upgrade.md)
        * [2.4.1 基于 TiOps 的集群滚动更新](chapter2/tiops-rolling-upgrade.md)
        * [2.4.2 基于 TiDB-Operator 的集群滚动更新](chapter2/tidb-operator-rolling-upgrade.md)
    * [2.5 TiDB 备份恢复和导入导出工具](chapter2/tidb-backup-restore-tools.md)
        * [2.5.1 4.0 增量数据订阅 CDC](chapter2/cdc-intro.md)
            * [2.5.1.1 CDC 解决什么问题](chapter2/why-cdc.md)
            * [2.5.1.2 CDC 工作原理](chapter2/cdc-internal.md)
            * [2.5.1.3 CDC 实操指南](chapter2/cdc-in-action.md)
                <!--
                CDC 的部署
                下游连接 TiDB
                下游连接 Kafka
                订阅 Open CDC protocol 定制业务
                -->
        * [2.5.2 TiDB 数据导入工具 Lightning](chapter2/lightning-intro.md)
            * [2.5.2.1 Lightning 工作原理](chapter2/lightning-internal.md)
            * [2.5.2.2 Lightning 实操指南](chapter2/lightning-in-action.md)
        * [2.5.3 4.0 分布式备份恢复工具 BR](chapter2/br.md)
            * [2.5.3.1 BR 工作原理](chapter2/br-internal.md)
            * [2.5.3.2 BR 实操指南](chapter2/br-in-action.md)
                <!--
                使用 BR 进行备份
                使用 BR 进行恢复
                使用 BR 进行增量备份和恢复
                -->
        * [2.5.4 4.0 分布式导出工具 Dumpling](chapter2/dumpling-intro.md)
            * [2.5.4.1 Dumpling 工作原理](chapter2/dumpling-internal.md)
            * [2.5.4.2 Dumpling 实操指南](chapter2/dumpling-in-action.md)
                <!--
                ;使用 Dumpling 导出数据
                -->
        * [2.5.5 灾难快速恢复](chapter2/disaster-recovery.md)
            * [2.5.5.1 利用 GC 快照读恢复数据](chapter2/recover-data-gc.md)
                <!--
                ;GC 机制简介
                -->
            * [2.5.5.2 利用 Recover 命令秒恢复误删表](chapter2/recover-statements.md)
            * [2.5.5.3 多数副本丢失数据恢复指南](chapter2/recover-quorum.md)

## TiDB 最佳实践

* [3 TiDB 的使用最佳实践](chapter3/tidb-best-practices.md)
    * [3.1 TiDB 和 MySQL 的区别](chapter3/mysql-compatibility.md)
        <!--
        与 MySQL 兼容性对比
        TiDB 与 MySQL 的语句兼容性说明
        -->
    * [3.2 TiDB 事务模型](chapter3/tidb-transaction-mode.md)
        * [3.2.1 乐观事务](chapter3/optimistic-txn.md)
        * [3.2.2 悲观事务](chapter3/pessimistic-txn.md)
        * [3.2.2 4.0 的大事务支持](chapter3/big-txn-in-4.0.md)
    * [3.3 TiDB DDL](chapter3/tidb-ddl-intro.md)
        * [3.3.1 表结构设计最佳实践](chapter3/tidb-schema-design.md)
        * [3.3.2 如何查看 DDL 状态](chapter3/tidb-ddl-status.md)
        * [3.3.3 Sequence](chapter3/sequence.md)
        * [3.3.4 Auto Random](chapter3/autorandom.md)
    * [3.4 Titan 简介与实战](chapter3/titan-intro.md)
        * [3.4.1 Titan 原理介绍](chapter3/titan-internal.md)
        * [3.4.2 在 TiDB 集群中开启 Titan](chapter3/titan-in-action.md)
    * [3.5 TiFlash 简介与 HTAP 实战](chapter3/tiflash-intro.md)
        * [3.5.1 TiDB HTAP 的特点](chapter3/tidb-htap.md)
        * [3.5.2 TiFlash 架构](chapter3/tiflash-architecture.md)
        * [3.5.3 TiFlash 原理](chapter3/tiflash-internal.md)
        * [3.5.4 TiFlash 的部署和使用](chapter3/tiflash-in-action.md)
        * [3.5.5 TiSpark on TiFlash](chapter3/tispark-on-tiflash.md)
* [4 TiDB Troubleshooting 指南](chapter4/trouble-shooting.md)
    * [4.1 TiDB Dashboard](chapter4/tidb-dashboard-intro.md)
        * [4.1.1 通过 KeyVis 来识别业务的模式](chapter4/key-vis.md)
        * [4.1.2 快速定位慢 SQL](chapter4/located-slow-sql.md)
        * [4.1.3 如何获取性能 Profile](chapter4/get-profile.md)
        * [4.1.4 集群诊断报告](chapter4/diagnosis-report.md)
        * [4.1.5 可视化 Statements](chapter4/statements-ui.md)
    * [4.2 诊断系统表](chapter4/sql-diagnosis.md)
        * [4.2.1 SQL 慢查询内存表](chapter4/slow-query-table.md)
        * [4.2.2 Processlist](chapter4/processlist.md)
        * [4.2.3 Statements](chapter5/statements.md)
    * [4.3 TiDB 集群监控与报警](chapter4/tidb-monitor-alert.md)
        * [4.3.1 性能调优地图](chapter4/performance-map.md)
        * [4.3.2 TiDB 读写流程相关监控原理解析](chapter4/read-write-metrics.md)
        * [4.3.3 Oncall 地图](chapter4/oncall-map.md)
        * [4.3.4 Prometheus 使用指南](chapter4/prometheus-guide.md)
    * [4.4 SQL Plan Management](chapter4/sql-plan-management.md)
        * [4.4.1 TiDB Hint](chapter4/tidb-hint-syntax.md)
    * [4.5 限制 SQL 的内存使用和执行时间](chapter4/memory-quota-execution-time-limit.md)
* [5 TiDB 调优指南](chapter5/optimization-guide.md)
    * [5.1 SQL 调优](chapter5/sql-optimizer.md)
        * [5.1.1 TiDB 执行计划概览](chapter5/sql-plan.md)
    * [5.2 如何做动态配置修改](chapter5/online-changing-config.md)
    * [5.3 TiDB 常见配置优化](chapter5/tidb-common-config-optimize.md)
    * [5.4 TiKV 常见配置优化](chapter5/tikv-common-config-optimize.md)
    * [5.5 常见读写热点问题调优](chapter5/hotspot-resolved.md)
    * [5.6 添加索引调优加速](chapter5/add-index-optimization.md)
        * [5.6.1 TiDB 增加索引原理](chapter5/add-index-internal.md)
        * [5.6.2 动态调整新增索引速度](chapter5/speedup-add-index.md)
* [6 TiDB 安全](chapter6/tidb-security.md)
    * [6.1 权限管理](chapter6/privilege-management.md)
    * [6.2 RBAC](chapter6/rbac.md)
    * [6.3 证书管理与数据加密](chapter6/cert-management-data-encryption.md)

## 实战篇

* [7 TiDB 跨数据中心部署模式](chapter7/cross-dc.md)
    * [7.1 三个或以上的数据中心](chapter7/3-dc.md)
    * [7.2 两数据中心](chapter7/two-dc.md)
* [8 数据迁移](chapter8/data-migration.md)
    * [8.1 从HBase 迁移到 TiDB](chapter8/data-migration-from-hbase.md)
    * [8.2 从 DB2 迁移到 TiDB](chapter8/data-migration-from-db2.md)
    * [8.3 从 Oracle 迁移到 TiDB](chapter8/data-migration-from-oracle.md)
        * [8.3.1 Oracle GoldenGate](chapter8/data-migration-ogg.md)
    * [8.4 从 MySQL 分库分表迁移到 TiDB](chapter8/data-migration-from-mysql-sharding.md)
        * [8.4.1 DM 原理及介绍](chapter8/dm-internal.md)
        * [8.4.2 使用 DM 同步 MySQL 数据](chapter8/dm-in-action.md)
* [9 如何参与 TiDB 社区及周边生态](chapter9/tidb-contribution-guide.md)
    * [9.1 Contributor map 简介](chapter9/tidb-contribution-map.md)
* [10 一些有用的学习资料](chapter10/references.md)

## 附录

* [专用术语解释](appendix/tidb-term.md)












        

            







        