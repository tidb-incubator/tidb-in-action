# TiOps 部署生产环境集群

## 操作系统版本要求

暂时只支持 CentOS	7.3 及以上 Linux 操作系统。

## 生产环境服务器建议配置

| 组件 | CPU | 内存 | 硬盘类型 | 网络 | 实例数量(最低要求) |
|----|----|----|----|----|----|
| PD | 4 核+ | 8 GB+ | SSD | 万兆网卡（2块最佳） | 3 |
| TiDB | 16 核+ | 32 GB+ | SAS | 万兆网卡（2块最佳） | 2 |
| TiKV | 16核+ | 32 GB+ | SSD | 万兆网卡（2块最佳） | 3 |
| 监控 | 8核+	 | 16 GB+ | SAS | 千兆网卡 | 1 |

### 注意事项

- TiKV 至少要 3 台
  + TiKV 硬盘大小配置建议 PCI-E SSD 不超过 2 TB，普通 SSD 不超过 1.5 TB
- PD 至少要 3 台，TiDB 至少要 2 台
  + 生产环境中的 TiDB 和 PD 可以部署和运行在同一台服务器上
  + 但对性能和可靠性有更高的要求，应尽可能分开部署
- 生产环境强烈推荐使用更高的配置

## 生产环境网络要求

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

## topology 配置

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
  - ip: 10.9.1.5
  - ip: 10.9.1.6

monitoring_server:
  - ip: 10.9.1.7

grafana_server:
  - ip: 10.9.1.7
```

参照上一章的部署和启动，即可使用 TiOps 在生产环境部署一套可用的 TiDB 集群。
