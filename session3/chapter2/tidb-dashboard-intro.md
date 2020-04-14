# 第 2 章 TiDB Dashboard 介绍

从4.0版本开始，TiDB提供了一个新的Dashboard运维管理工具，集成在PD组件上，默认地址为`http://pd-url:pd_port/dashboard`。不同于Grafana监控是从数据库的监控视角出发，TiDB Dashboard从DBA管理员角度出发，最大限度的简化管理员对TiDB数据库的运维，可在一个界面查看到整个分布式数据库集群的运行状况，包括数据热点、SQL运行情况、集群信息、日志搜索、实时性能分析等。

* [识别集群热点和业务访问模](key-vis.md)
* [分析 SQL 执行性](statements.md)
* [生成集群诊断报告](diagnosis-report.md)
* [日志搜索和导](log-export.md)
* [分析组件 CPU 消耗情](profiling.md)
