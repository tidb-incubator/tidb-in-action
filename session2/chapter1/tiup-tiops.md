# 1.1 TiUP & TiOps

在单机部署一个 TiDB 集群要多久？

之前，我们其实很难回答这个问题，但现在可以很自豪的说「一分钟」。为什么会这么快？因为我们专门为 TiDB 4.0 做了一个全新的组件管理工具：TiUP 。

在多机环境部署一个 TiDB 集群要多久？

之前，我们同样很难回答这个问题，但现在，答案仍然是「一分钟」，因为我们可以方便地使用 TiUP cluster 功能来快速部署集群。

TiUP 会管理 TiDB 整个生态里面的组件，无论是核心组件 tidb/tikv/pd/tiflash 等，还是生态工具 prometheus/grafana/drainer/pump 等，都可以通过 TiUP 来进行管理和使用，用户也可以给 TiUP 添加各种组件工具。

本章我们就来介绍 TiUP 的功能和用法。

