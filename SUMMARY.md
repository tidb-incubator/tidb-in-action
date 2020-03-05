# Summary

* [推荐序](PREFACE.md)

## 第一部分 TiDB 原理和特性

* [1 TiDB 整体架构](session1/chapter1/tidb-architecture.md) @黄东旭
* [2 说存储](session1/chapter2/tidb-storage.md)  @黄东旭
* [3 说计算](session1/chapter3/tidb-computing.md)
    * [3.1 统计信息](session1/chapter3/tidb-statistics.md)
    * [3.2 字符集和排序规则](session1/chapter3/tidb-charset-collation.md) @zhiqiangxu
* [4 说调度](session1/chapter4/tidb-scheduling.md)
    * [4.1 空间均衡](session1/chapter4/region-balance.md)
    * [4.2 负载均衡](session1/chapter4/load-balance.md)
    * [4.3 弹性调度](session1/chapter4/elastic-scheduling.md) @[pengji](https://github.com/pengji)
* [5 TiDB 和 MySQL 的区别](session1/chapter5/mysql-compatibility.md) @董红亮
        <!--
        与 MySQL 兼容性对比
        TiDB 与 MySQL 的语句兼容性说明
        -->
* [6 TiDB 事务模型](session1/chapter6/tidb-transaction-mode.md)
    * [6.1 乐观事务](session1/chapter6/optimistic-txn.md) 
    * [6.2 悲观事务](session1/chapter6/pessimistic-txn.md)
    * [6.3 4.0 的大事务支持](session1/chapter6/big-txn-in-4.0.md) @薛超
* [7 TiDB DDL](session1/chapter7/tidb-ddl-intro.md)
    * [7.1 表结构设计最佳实践](session1/chapter7/tidb-schema-design.md)
    * [7.2 如何查看 DDL 状态](session1/chapter7/tidb-ddl-status.md) @高海涛
    * [7.3 Sequence](session1/chapter7/sequence.md) @潘迪
    * [7.4 Auto Random](session1/chapter7/autorandom.md)
    * [7.5 Expression index](session1/chapter7/expression-index.md)
* [8 Titan 简介与实战](session1/chapter8/titan-intro.md)
    * [8.1 Titan 原理介绍](session1/chapter8/titan-internal.md) @孙晓光
    * [8.2 在 TiDB 集群中开启 Titan](session1/chapter8/titan-in-action.md) @孙晓光
* [9 TiFlash 简介与 HTAP 实战](session1/chapter9/tiflash-intro.md)
    * [9.1 TiDB HTAP 的特点](session1/chapter9/tidb-htap.md) @彭鑫
    * [9.2 TiFlash 架构与原理](session1/chapter9/tiflash-architecture.md) @徐嘉埥
    * [9.3 TiFlash 的使用](session1/chapter9/tiflash-in-action.md) @刘筠松 @王文安
    * [9.4 TiSpark on TiFlash](session1/chapter9/tispark-on-tiflash.md) @李振环
* [10 TiDB 安全](session1/chapter10/tidb-security.md)
    * [10.1 权限管理](session1/chapter10/privilege-management.md)
    * [10.2 RBAC](session1/chapter10/rbac.md)
    * [10.3 证书管理与数据加密](session1/chapter10/cert-management-data-encryption.md)

## 第二部分 系统安装部署与管理
* [1 部署安装 & 常规运维](session2/chapter1/deployment-management.md)
    * [1.1 TiUP & TiOps](session2/chapter1/tiup-tiops.md)
        * [1.1.1 TiUP 简介](session2/chapter1/tiup-intro.md) @罗瑞兴
        * [1.1.2 用 TiUP 部署本地测试环境](session2/chapter1/tiup-playground.md) @罗瑞兴
        * [1.1.3 用 TiUP 部署生产环境集群](session2/chapter1/tiup-deployment.md) @罗瑞兴
        * [1.1.4 TiOps 简介](session2/chapter1/tiops-intro.md) @杨文
        * [1.1.5 TiOps 部署生产环境集群](session2/chapter1/tiops-deployment.md) @杨文
    * [1.2 TiDB on Kubernetes](session2/chapter1/tidb-on-k8s.md)
        * [1.2.1 TiDB-Operator 简介](session2/chapter1/tidb-operator-intro.md) @宋歌
        * [1.2.2 TIDB-Operator 部署本地测试集群（基于 Kind）](session2/chapter1/tidb-oprator-local-deployment.md) @李银龙
        * [1.2.3 用 TiDB-Operator 部署生产环境集群](session2/chapter1/tidb-operator-deployment.md) @李银龙
    * [1.3 集群扩容缩容](session2/chapter1/tidb-scale.md)
        * [1.3.1 基于 TiOps 的集群扩缩容](session2/chapter1/tiops-scale.md)
        * [1.3.2 基于 TiDB-Operator 的集群扩缩容](session2/chapter1/tidb-operator-scale.md) @[曹贺](https://github.com/caohe)
    * [1.4 集群版本升级](session2/chapter1/tidb-upgrade.md)
        * [1.4.1 基于 TiOps 的集群滚动更新](session2/chapter1/tiops-rolling-upgrade.md)
        * [1.4.2 基于 TiDB-Operator 的集群滚动更新](session2/chapter1/tidb-operator-rolling-upgrade.md)
    * [1.5 如何做动态配置修改](session2/chapter1/online-changing-config.md)

* [2 TiDB 备份恢复和导入导出工具](session2/chapter2/tidb-backup-restore-tools.md)
    * [2.1 4.0 增量数据订阅 CDC](session2/chapter2/cdc-intro.md)
        * [2.1.1 CDC 解决什么问题](session2/chapter2/why-cdc.md) @刘宇
        * [2.1.2 CDC 工作原理](session2/chapter2/cdc-internal.md) @刘春辉
        * [2.1.3 CDC 实操指南](session2/chapter2/cdc-in-action.md) @刘春辉(部署 + 下游链接TiDB)
            <!--
            CDC 的部署
            下游连接 TiDB
            下游连接 Kafka
            订阅 Open CDC protocol 定制业务
            -->
    * [2.2 TiDB 数据导入工具 Lightning](session2/chapter2/lightning-intro.md) 
        * [2.2.1 Lightning 工作原理](session2/chapter2/lightning-internal.md) @刘春雷
        * [2.2.2 Lightning 实操指南](session2/chapter2/lightning-in-action.md) @李红
    * [2.3 4.0 分布式备份恢复工具 BR](session2/chapter2/br.md)
        * [2.3.1 BR 工作原理](session2/chapter2/br-internal.md)
        * [2.3.2 BR 实操指南](session2/chapter2/br-in-action.md)
            <!--
            使用 BR 进行备份
            使用 BR 进行恢复
            使用 BR 进行增量备份和恢复
            -->
    * [2.4 4.0 分布式导出工具 Dumpling](session2/chapter2/dumpling-intro.md)
        * [2.4.1 Dumpling 工作原理](session2/chapter2/dumpling-internal.md)
        * [2.4.2 Dumpling 实操指南](session2/chapter2/dumpling-in-action.md)
            <!--
            ;使用 Dumpling 导出数据
            -->

## 第三部分 TiDB Troubleshooting 指南与工具

* [1 SQL 调优原理](session3/chapter1/optimization-guide.md)
    * [1.1 TiDB 执行计划概览](session3/chapter1/sql-plan.md)
    * [1.2 SQL Plan Management](session3/chapter1/sql-plan-management.md)
    * [1.3 限制 SQL 的内存使用和执行时间](session3/chapter1/memory-quota-execution-time-limit.md)
* [2 TiDB Dashboard](session3/chapter2/tidb-dashboard-intro.md)
    * [2.1 通过 KeyVis 来识别业务的模式](session3/chapter2/key-vis.md)
    * [2.2 快速定位慢 SQL](session3/chapter2/located-slow-sql.md)
    * [2.3 如何获取性能 Profile](session3/chapter2/get-profile.md)
    * [2.4 集群诊断报告](session3/chapter2/diagnosis-report.md)
    * [2.5 可视化 Statements](session3/chapter2/statements-ui.md)
* [3 诊断系统表](session3/chapter3/sql-diagnosis.md)
    * [3.1 SQL 慢查询内存表](session3/chapter3/slow-query-table.md) @王志广
    * [3.2 Processlist](session3/chapter3/processlist.md)
    * [3.3 Statements](session3/chapter3/statements.md)
* [4 TiDB 集群监控与报警](session3/chapter4/tidb-monitor-alert.md)
    * [4.1 性能调优地图](session3/chapter4/performance-map.md)
    * [4.2 TiDB 读写流程相关监控原理解析](session3/chapter4/read-write-metrics.md)
    * [4.4 Prometheus 使用指南](session3/chapter4/prometheus-guide.md) @谭清如
* [5 灾难快速恢复](session3/chapter5/disaster-recovery.md)
    * [5.1 利用 GC 快照读恢复数据](session3/chapter5/recover-data-gc.md)
        <!--
        ;GC 机制简介
        -->
    * [5.2 利用 Recover 命令秒恢复误删表](session3/chapter5/recover-statements.md) @薛超
    * [5.3 多数副本丢失数据恢复指南](session3/chapter5/recover-quorum.md) @陈付

## 第四部分 TiDB 最佳实践

* [1 适用场景介绍](session4/chapter1/scenarios.md) @贾世闻
* [2 硬件选型规划](session4/chapter2/hardware-selection.md) @George Li
* [3 常见性能压测](session4/chapter3/common-benchmarks.md)
    * [3.1 Sysbench 基准性能测试](session4/chapter3/sysbench.md) @唐希元
    * [3.2 TPC-C 基准性能测试](session4/chapter3/tpc-c.md) @樊一蒙
* [4 跨数据中心方案](session4/chapter4/multi-data-center-solution.md)
    * [4.1 两中心异步复制方案（binlog 复制）](session4/chapter4/two-dc-binlog.md) @王新宇
    * [4.2 两中心同步复制方案（三副本 Raft）](session4/chapter4/two-dc-raft.md) @王君怡
    * [4.3 两地三中心](session4/chapter4/3-dc.md) @杜蓉 @刘浩然
    * [4.4 AWS 跨 AZ 部署 TiDB](session4/chapter4/cross-az-in-aws.md) @George Li
* [5 数据迁移方案](session4/chapter5/data-migration.md)
    * [5.1 MySQL 到 TiDB （DM）](session4/chapter5/from-mysql-to-tidb.md)
        * [5.1.1 DM 同步单机 MySQL 到 TiDB 的实践](session4/chapter5/from-single-mysql-to-tidb.md) @张雯-B站
        * [5.1.2 DM 同步分库分表 MySQL 到 TiDB 的实践](session4/chapter5/from-sharding-to-tidb.md) @沈钧-壹米滴答
    * [5.2 Oracle 到 TiDB （OGG）](session4/chapter5/from-oracle-to-tidb.md) @王英杰
    * [5.3 SqlServer 到 TiDB](session4/chapter5/from-sqlserver-to-tidb.md) @汽车之家
    * [5.4 SqlServer 到 TiDB（DATAX）](session4/chapter5/from-sqlserver-to-tidb-using-datax.md) @Allen
    * [5.5 DB2 到 TiDB （CDC）](session4/chapter5/from-db2-to-tidb.md) @王新宇
    * [5.6 TiDB 到 TiDB（DATAX）](session4/chapter5/from-tidb-to-tidb-using-datax.md) @Jason
    * [5.7 Mongodb 迁移到 TiDB](session4/chapter5/from-mongodb-to-tidb.md) @胡国青
* [6 业务适配最佳实践](session4/chapter6/workload-adaptation-best-practices.md)
    * [6.1 业务开发最佳实践](session4/chapter6/application-dev-best-practices.md)
        * [6.1.1 如何避免乐观锁模式下事务冲突](session4/chapter6/avoid-optimistic-lock-conflicts.md) @George Li
        * [6.1.2 TiDB 中事务限制及应对方案](session4/chapter6/transaction-statement-count-limit.md) @谭仁刚
        * [6.1.3 高并发的唯一序列号生成方案](session4/chapter6/serial-number.md) @魏巍  @George Li
        * [6.1.4 一种高效分页批处理方案](session4/chapter6/page-inaction.md) @魏巍
        * [6.1.5 通过 hint 调整执行计划](session4/chapter6/tidb-hint.md) @George Li
    * [6.2 SQL 调优案例](session4/chapter6/sql-optimization-cases.md) @郑智晖-腾讯 @王英杰
    * [6.3 TiDB + TiSpark 跑批最佳实践](session4/chapter6/batch-tasks-best-practices.md) @高林
    * [6.4 分区表实践及问题处理](session4/chapter6/partition-table-best-practices.md)
        * [6.4.1 TiDB分区表简介](session4/chapter6/patition-table-info.md) @代晓磊
        * [6.4.2 TiDB分区表使用场景](session4/chapter6/patition-table-scenarios.md) @代晓磊
        * [6.4.3 TiDB分区表问题处理](session4/chapter6/partition-table-practices.md) @代晓磊
* [7 常见问题处理思路](session4/chapter7/common-issues.md)
    * [7.1 Oncall 地图](session4/chapter7/oncall-map.md) @黄潇
    * [7.2 热点问题处理思路](session4/chapter7/hotspot-resolved.md) @黄潇 @谭仁刚
    * [7.3 TiKV is busy 处理思路](session4/chapter7/tikv-is-busy.md) @冀浩东 @谭仁刚
    * [7.4 TiDB OOM 的常见原因](session4/chapter7/tidb-oom.md) @吕磊 @谭仁刚
* [8 TiDB 调优指南](session4/chapter8/optimization-guide.md)
    * [8.1 TiDB 常见配置优化](session4/chapter8/tidb-common-config-optimize.md) @胡盼盼
    * [8.2 TiKV 常见配置优化](session4/chapter8/tikv-common-config-optimize.md) @黄蔚
    * [8.3 添加索引调优加速](session4/chapter8/add-index-optimization.md)
        * [8.3.1 TiDB 增加索引原理](session4/chapter8/add-index-internal.md) @郑俊博
        * [8.3.2 动态调整新增索引速度](session4/chapter8/speedup-add-index.md) @郑俊博

## 第五部分 如何参与 TiDB 社区及周边生态
* [1 TiDB 开源社区治理架构介绍](session5/chapter1/open-source-governance.md)
    * [1.1 TiDB 产品发展简史](session5/chapter1/a-brief-history-of-tidb.md)
    * [1.2 TiKV 捐献到 CNCF](session5/chapter1/tikv-joined-cncf.md)
    * [1.3 周边生态工具融入到社区](session5/chapter1/ecosystem-tools-community.md)
    * [1.4 社区治理框架](session5/chapter1/community-governance.md)
* [2 TiDB 开源生态](session5/chapter2/tidb-open-source-ecosystem.md)
    * [2.1 社区重要活动介绍](session5/chapter2/events.md)
    <!--
    Devcon
    TechDay
    Infra Meetup
    TUG Meetup
    Hackathon
    -->
    * [2.2 社区重要合作开发（美团，知乎，高校）](session5/chapter2/community-cooperations.md)
    * [2.3 TUG（TiDB User Group）](session5/chapter2/tidb-user-group.md)
    * [2.4 Talent Plan](session5/chapter2/talent-plan.md)
    * [2.5 Challenge Program](session5/chapter2/challenge-program.md)
    * [2.6 PingCAP Incubator](session5/chapter2/pingcap-incubator.md)
    * [2.7 PingCAP University](session5/chapter2/pingcap-university.md)
    * [2.8 Contributor Map](session5/chapter2/contribution-map.md)
* [3 一些有用的学习资料](session5/chapter3/references.md)

## 附录

* [专用术语解释](appendix/tidb-term.md)












        

            







        

