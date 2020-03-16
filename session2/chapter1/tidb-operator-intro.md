## 1.2.1 TiDB Operator 简介及原理

​                             *—— 化繁为简的艺术*

### 1.2.1.1 背景

小时候，想象着 2020 年机器人早就普及了，机器人管家叫我起床，机器人厨师端上早餐，机器人司机开车送我去上班，路上还有机器人交警，到了公司是机器人姐姐接待，下班去看的是机器人牙医而且一点也不疼。

“快醒醒，客户爸爸问你 TiDB 集群怎么还没搞好？”

“天啊，为什么都 2020 年了还要人手动去维护分布式集群？为什么这群人要把 TiDB 设计成这么多组件？为什么 TiDB 集群半夜挂了不派个机器人去修复？”

“兄 dei，K8s 了解一下？“

### 1.2.1.2 简介

> TiDB Operator 是 Kubernetes 上的 TiDB 集群自动运维系统，提供包括部署、升级、扩缩容、备份恢复、配置变更的 TiDB 全生命周期管理。借助 TiDB Operator，TiDB 可以无缝运行在公有云或私有部署的 Kubernetes 集群上。
>
> ​                               ——来自 PingCAP 官方定义

TiDB Operator 像“牧羊人”一样，持续的监督并管理着 TiDB 各组件“羊群”以恰当的状态运行在主机集群“牧场”上。现在运维人员只要告诉 Operator “What to do“，而由 Operator 来决定 “How to do”。在最新版本 TiDB Operator 甚至可以根据实际情况来决定 "What to do"，比如：auto-scaler。真正实现了自动化运维，减轻运维人员维护压力，提高服务能力。

### 1.2.1.3 TiDB Operator 架构

![TiDB Operator 架构](/res/session2/chapter1/tidb-operator-overview.png)

### 1.2.1.4 TiDB Operator 组件

* TiDB Cluster 定义：CRD（`CustomResourceDefinition`）定义了 `TidbCluster` 等自定义资源，使得 Kubernetes 世界认识 TiDB Cluster 并让其与 `Deployment`、`StatefulSet` 一同享受 Kubernetes 的头等公民待遇。目前 TiDB Operator v1.1.0 版本包含的 CRD 有：`TidbCluster`、`Backup`、`Restore`、`BackupSchedule`、`TidbMonitor`、`TidbInitializer` 以及 `TidbClusterAutoScaler`。
* 控制器：`tidb-controller-manager` 包含了一组自定义控制器，控制器通过循环不断比对被控制对象的期望状态与实际状态，并通过自定义的逻辑驱动被控制对象达到期望状态。
* 调度器：`tidb-scheduler` 是一个 Kubernetes 调度器扩展，它为 Kubernetes 调度器注入 TiDB 集群特有的调度逻辑，比如：为保证高可用，任一 Node 不能调度超过 TiDB 集群半数以上的 TiKV 实例。

### 1.2.1.5 自定义资源

* TiDB Cluster 资源：CR（`CustomResource`）声明了 TiDB Cluster 自定义资源对象，它声明了 `TidbCluster` 对象的期望状态，并被控制器逻辑不断进行处理，同时将实际运行状态记录下来。

### 1.2.1.6 Kubernetes 控制平面

* `kube-apiserver`：Kubernetes 控制平面的前端，所有组件通过 API Server 获取或更新对象信息。

* `kube-controller-manager`：`TidbCluster` 等 CR 封装了 `StatefulSet`、`Deployment`、`CronJob` 等原生对象，所以依然需要 K8s 原生控制器来进行控制逻辑。

* `kube-scheduler`：调度 TiDB Cluster 的 Pod，`filtering` 阶段，kube-scheduler 筛选出的节点会再经过 `tidb-scheduler` 筛选一次，然后 kube-scheduler 再进行 `scoring` 选择最合适的节点进行 Pod 调度。

举个栗子（脑洞）：

***小明买了辆家用车，去修车厂改造成变形金刚。***

这辆家用车类似 `Deployment`、`StatefulSet` 这类原厂的标准化组件。改造成独一无二的变形金刚需要设计图纸（`CRD`）。同时原来车上的零件需要实现新的功能（自定义控制器），轮子不仅能转还可以当关节，后备箱不仅能装东西还可以变成脚。修车厂（K8s 控制平面）根据设计图纸和控制逻辑真的造出了一个变形金刚（`CR`）。这个变形金刚可以根据环境的不同而改变形态（调度器），甚至还可以在战斗损坏后进行修复（调和）。

### 1.2.1.7 原理浅析

![TiDB-Operator-control-flow](/res/session2/chapter1/tidb-operator-control-flow.png)

TiDB Operator 中使用 Helm Chart 封装了 TiDB 集群定义。整体的控制流程如下：

1. 用户通过 Helm 创建 `TidbCluster` 对象和相应的一系列 Kubernetes 原生对象，比如执行定时备份的 `CronJob`；
2. TiDB Operator 会通过 Kubernetes API Server watch `TidbCluster` 以及其它相关对象，基于集群的实际状态不断调整 PD、TiKV、TiDB 的 `StatefulSet` 和 `Service` 对象；
3. Kubernetes 的原生控制器根据 `StatefulSet`、`Deployment`、`CronJob` 等对象创建更新或删除对应的 `Pod`；
4. PD、TiKV、TiDB 的 `Pod` 声明中会指定使用 `tidb-scheduler` 调度器，`tidb-scheduler` 会在调度对应 `Pod` 时应用 TiDB 的特定调度逻辑。

基于上述的声明式控制流程，TiDB Operator 能够自动进行集群节点健康检查和故障恢复。部署、升级、扩缩容等操作也可以通过修改 `TidbCluster` 对象声明“一键”完成。
