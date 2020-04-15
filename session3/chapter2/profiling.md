# 2.5 分析组件 CPU 消耗情况

上一节介绍日志搜索功能。

本节将重点对 TiDB、TiKV、PD 节点在不重启的情况下进行内部性能数据分析。

收集的性能数据可显示为火焰图或 go profile 有向无环图，直观展现各节点在性能收集时间段内执行的各种内部操作及比例，快速了解该节点 CPU 资源消耗的主要方向。

## 1. 开始性能分析

登录 Dashboard 后，可在左侧功能导航处点击「高级调试 → 节点性能分析」进入性能分析页面。

选择一个或多个需要进行性能分析的节点，并选择性能分析时长(默认为 30 秒，最多 120 秒)，点击「开始分析」，即可开始性能分析。

如下图：

![](/res/session3/chapter2/profiling/1.jpg)

## 2. 查看性能分析状态

开始性能分析后，页面将以 1 秒为周期更新显示性能分析的进度，如下图：

![](/res/session3/chapter2/profiling/2.jpg)

> 注意：
> 
> Dashboard 所在 PD 节点上需安装有 go、go pprof、GraphViz，否则无法对 TiDB 和 PD 节点进行性能分析，TiKV 的性能分析没有依赖要求。

## 3. 下载性能分析结果

所有节点的性能分析完成后，点击「下载性能分析结果」按钮，打包下载性能分析成功节点的分析结果，如下 TiDB、TiKV 图：

- TiDB Profile 图可以清楚的分析每个函数执行的时间

![](/res/session3/chapter2/profiling/tidb.jpg)

- TiKV 火焰图可以分析出 CPU 资源消耗情况

![](/res/session3/chapter2/profiling/tikv.jpg)


综上所述，TiDB 4.0 实现了对各个组件的 CPU 性能分析功能，帮助 TiDB 用户直观的了解组件性能情况，及时准备优化方案。
