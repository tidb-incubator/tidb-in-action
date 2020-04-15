## 5.3 多数副本丢失数据恢复指南

## 5.3.1 问题背景

TiDB 默认配置为 3 副本，每一个 Region 都会在集群中保存 3 份，它们之间通过 Raft 协议来选举 Leader 并同步数据。Raft 协议可以保证在数量小于副本数（注意，不是节点数）一半的节点挂掉或者隔离的情况下，仍然能够提供服务，并且不丢失任何数据。
对于 3 副本集群，挂掉一个节点除了可能会导致性能有抖动之外，可用性和正确性理论上不会受影响；
但是挂掉 2 个副本，一些 region 就会不可用，而且如果这 2 个副本无法完整地找回了，还存在永久丢失部分数据的可能。
这里主要讨论 2 个或 3 个副本丢失的问题。

在实际生产环境中，TiDB 集群是可能会出现丢失数据情况，如：
  - 一个 TiDB 集群可能会出现多台 TiKV 机器短时间内接连故障且无法短期内恢复
  - 一个双机房部署的 TiDB 集群的其中一个机房整体故障等

在上述这些情形下，会出现部分 Region 的多个副本（包含全部副本的情况）同时故障，进而导致 Region 的数据部分或全部丢失的问题。
这个时候，最重要的是快速地最大程度地恢复数据并恢复 TiDB 集群正常服务。

## 5.3.2 副本数据恢复思路简析

副本数据恢复包含两个部分：故障 Region 处理和丢失数据处理

- 故障 Region 处理，针对 Region 数据丢失的严重情况，可分为两种：
  - Region 至少还有 1 个副本，恢复思路是在 Region 的剩余副本上移除掉所有位于故障节点上的 Peer，
  这样可以用这些剩余副本来重新选举和补充副本来恢复，但这些剩余副本中可能不包含最新的 Raft Log 更新，这个时候就会丢失部分数据
  - Region 的所有副本都丢失了，这个 Region 的数据就丢失了，无法恢复。
  可以通过创建 1 个空 Region 来解决 Region 不可用的问题
  - 在恢复 Region 故障的过程中，要详细记录下所处理 Region 的信息，如 Region ID、Region 丢失副本的数量等
- 丢失数据处理
  - 根据故障 Region ID 找到对应的表，找到相关用户并询问用户在故障前的某一段时间内（比如 5 min），大概写入了哪些数据表，是否有 DDL 操作，是否可以重新消费更上游的数据来再次写入，等等
  - 如果可以重导，则是最简单的处理方式。否则的话，则只能对重要的数据表，检查数据索引的一致性 ，保证还在的数据是正确无误的

## 5.3.3 故障 Region 的处理操作步骤

故障 Region 处理步骤包括：处理前禁用 PD 调度、处理还有剩余副本的 Region、处理所有副本都丢失的 Region、处理后恢复 Region 调度。

- 处理前后的 PD 调度处理
  - 为将恢复过程中可能的异常情况降到最少，需在故障处理期间禁用相关的调度：
    - 通过 `pd-ctl config get` 获取 region-schedule-limit、replica-schedule-limit、leader-schedule-limit、merge-schedule-limit
    这 4 个参数的值，并记录下来用于后面恢复设置
    - 通过 `pd-ctl config set` 将这 4 个参数设为 0
    - 处理完之后需要将这 4 个参数进行恢复

- 处理还有剩余副本的 Region
  - 使用 pd-ctl 检查大于等于一半副本数在故障节点上的 Region，并记录它们的 ID（假设故障节点为 1，4，5）：
  
    ```
    pd-ctl -u <endpoint> -d region --jq=’.regions[] | {id: .id, peer_stores: [.peers[].store_id] | select(length as $total | map(if .==(1,4,5) then . else empty end) | length>=$total-length) }’
    ```
    
  - 根据上面的 Region 的个数，可以采取 2 种不同的解决方式（运行以下命令时需关闭相应 Store 上面的 TiKV）：
    - Region 比较少，则可以在给定 Region 的剩余副本上，移除掉所有位于故障节点上的 Peer，在这些 Region 的未发生掉电故障的机器上运行：
    
    ```
    tikv-ctl --db /path/to/tikv-data/db unsafe-recover remove-fail-stores -s <s1,s2> -r <r1,r2,r3>
    ```
    
    - 反之，则可以在所有未发生掉电故障的实例上，对所有 Region 移除掉所有位于故障节点上的 Peer，在所有未发生掉电故障的机器上运行：
    
    ```
    tikv-ctl --db /path/to/tikv-data/db unsafe-recover remove-fail-stores -s <s1,s2> --all-regions
    ```
    
    - 执行后所有仍然有副本健在的 Region 都可以选出 Leader

- 处理所有副本都丢失的 Region
  - 重启 PD，重启 TiKV 集群，使用 `pd-ctl` 检查没有 Leader 的 Region：
  
    ```
    pd-ctl -u <endpoint> -d region --jq '.regions[]|select(has("leader")|not)|{id: .id, peer_stores: [.peers[].store_id]}'
    ```
   
  - 创建空 Region 解决 Unavailable 报错。任选一个 Store，关闭上面的 TiKV，然后执行：

    ```
    tikv-ctl --db /path/to/tikv-data/db recreate-region --pd <endpoint> -r <region_id>
    ```
