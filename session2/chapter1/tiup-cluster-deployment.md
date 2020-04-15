### 1.1.4 TiUP cluster 部署生产环境集群

### 操作系统版本要求

* 仅支持 CentOS 7.3 及以上 Linux 操作系统。

### 生产环境服务器数量和配置参数

| 组件 | CPU | 内存 | 硬盘类型 | 磁盘大小 | 网络 | 机器数量 |
|----|----|----|----|----|----|----|
| PD | >= 4 Core | >= 8 GB | SSD | >= 300 GB | >= 1 块万兆网卡 | 3 |
| TiDB | >= 16 Core | >= 32 GB | SAS/SSD | >= 300 GB | >= 1 块万兆网卡 | 2 |
| TiKV | >= 16 Core | >= 32 GB | SSD | <= 2 TB | >= 1 块万兆网卡 | 3 |
| Prometheus | >= 8 Core | >= 16 GB | SAS/SSD | >= 300 GB | >= 1 块千兆网卡或者万兆网卡 | 1 |

### 注意事项

- TiDB
  + 机器数量 >= 2 台，若每台机器资源较丰富，则建议部署多个 tidb-server
  + 磁盘建议 SAS/SSD，建议容量 >= 300 GB
- TiKV
  + 机器数量 >= 3 台，若每台机器有多块磁盘，建议部署多个 tikv-server
  + 部署推荐配置 label，配置后系统才会将根据 label 将数据分布在不同的机房、机架、机器防止有单个机房或者机架或者机器宕机时，系统才具备容灾能力
  + 磁盘建议采用 SSD，其中建议 PCI-E SSD 容量 <= 2 TB, 普通 SSD 容量 <= 1.5 TB
- PD
  + 机器数量 >= 3 台
  + 磁盘建议采用 SSD，容量建议 >= 300 GB
- Prometheus
  + 机器数量 1 台，若资源较紧张，可与其他组件混合部署
- Other
  + 若资源较紧张时 TiDB、PD、Prometheus 可混合部署在同一台服务器上
  + 若对性能、可靠性有更高的要求，建议按组件分别部署
  + 生产环境强烈推荐使用更高的配置

### 生产环境网络要求

TiDB 正常运行需要网络环境提供如下的网络端口配置，管理员可根据实际 TiDB 组件部署的需要进行调整：

| 组件 | 默认端口 | 说明 |
|----|----|----|
| TiDB |  4000 | 应用及 DBA 工具访问通信端口 |
| TiDB |  10080 | TiDB 状态信息上报通信端口 |
| TiKV |  20160 | TiKV 通信端口 |
| PD |  2379 | 提供 TiDB 和 PD 通信端口 |
| PD |  2380 | PD 集群节点间通信端口 |
| Pump |  8250 | Pump 通信端口 |
| Drainer |  8249 | Drainer 通信端口 |
| Prometheus |  9090 | Prometheus 服务通信端口 |
| Pushgateway |  9091 | TiDB，TiKV，PD 监控聚合和上报端口 |
| Node_exporter |  9100 | TiDB 集群每个节点的系统信息上报通信端口 |
| Blackbox_exporter |  9115 | Blackbox_exporter 通信端口，用于 TiDB 集群端口监控 |
| Grafana |  3000 | Web 监控服务对外服务和客户端(浏览器)访问端口 |
| Grafana |  8686 | grafana_collector 通信端口，用于将 Dashboard 导出为 PDF 格式 |
| Kafka_exporter | 9308 | Kafka_exporter 通信端口，用于监控 binlog kafka 集群 |

### topology 配置

```yaml
---

pd_servers:
  - ip: 10.9.1.1
  - ip: 10.9.1.2
  - ip: 10.9.1.3

tidb_servers:
  - ip: 10.9.1.2
  - ip: 10.9.1.3

tikv_servers:
  - ip: 10.9.1.4
    ## The value of label can be customized, for example: 'zone=z1,rack=r1,host=h1' or 'a=a1,b=b1,c=c1', etc
    ## Can only set in tikv_servers
    # label: host=h1
  - ip: 10.9.1.5
  - ip: 10.9.1.6

monitoring_server:
  - ip: 10.9.1.7

grafana_server:
  - ip: 10.9.1.7
```

label 可以自定义，例如：`'zone=z1,rack=r1,host=h1'` 或 `'a=a1,b=b1,c=c1'`。label 只能在 tikv_servers 上设置。

### 部署方法

参照上一节的部署和运维管理操作，即可使用 TiOps 在生产环境部署一套可用的 TiDB 集群。

