TiOps 滚动升级
------------

滚动升级功能借助 TiDB 的分布式能力，升级过程中尽量保证对前端业务透明、无感知。升级过程中工具会逐个节点升级。
升级 PD 时，工具会优先升级非 Leader 节点，所有非 Leader 节点升级完成后，工具会向 PD 发送一条命令将 Leader 迁移到升级完成的节点上，同时升级过程中，若发现有不健康的节点时工具会中止本次升级并退出，此时需要由人工判断、修复后再执行升级。
升级 TiKV 时工具会向 PD 发送一条迁移 Leader 的命令，等待迁移 Leader 完成后再进行到下一步，通过迁移 Leader 确保升级过程中不影响前端业务。

## 版本升级

```
$ tiops upgrade -c tidb-test -t v4.0.0-beta.1
```

`-c` 集群名称和 `-t` 版本号是必选参数，其他可选参数为：
```
-r|--role role 按照 TiDB 服务的角色类型，分别启动，取值："pd", "tikv", "pump", "tidb",  "drainer", "monitoring", "monitored", "grafana", "alertmanager"
-n|--node-id node_id 根据节点 ID 启动服务，节点 ID 可通过 display 命令获得
--force 常规情况是滚动升级，设置此参数，升级时会强制停机、重启
--local-pkg 若无外网，可将安装包拷贝中控机本地，通过此参数指相关路径进行离线安装
--enable-check-config：检查配置文件是否合法，默认：disable
-f | --forks 并发执行数量，默认：5
```
