# 1. 部署架构
TiDB两地三中心架构基于Raft算法，保证集群数据一致性和高可用。两地是同城、异地，同城双中心指在同城或临近城市建立独立数据中心，双中心通过高速链路实时同步数据，网络延迟相对较小，另外一个数据中心在异地城市。在这种场景下，可以把业务流量同时派发到同城两个数据中心，通过控制Region leader和PD leader 分布在同城两个数据中心。

## 1.1 架构图
以北京和西安为例阐述TiDB两地三中心架构部署模型，这里采用北京两个机房IDC1和IDC2，异地西安一个机房IDC3。北京与西安之间延迟低于3ms，北京与西安之间使用ISP专线，延迟约20ms。

如下图1所示为集群部署架构图，具体如下：
* 部署采用主从架构，主集群作为生产集群，承担日常生产服务，从集群同通过binlog异步同步主集群数据库，作为备份数据库使用。
* 生产集群采用两地三中心，分别为北京IDC1，北京IDC2，西安IDC3。
* 生产集群采用5副本模式，其中IDC和IDC2分别放2个副本，IDC3放1个副本；TiKV按机柜打Label，既每个机柜上有一份副本。
* 从集群与主集群直接通过binlog同步采用消息缓存服务器Kafka完成中间数据存储与传输工作。

![图片](https://github.com/Ryan160922/tidb-in-action/blob/master/session4/chapter4/p1.png "图 1  两地三中心集群架构图") <p align="center"> 图 1  两地三中心集群架构图</p>  

该架构具备高可用和容灾备份能力。相比于三数据中心方案优势如下：
* 写入速度更优。
* 两中心同时提供服务资源利用率更高。
* 可保证任一数据中心失效后，服务可用并且不发生数据丢失。
缺点很明显，因TiDB两地三中心基于Raft算法，同城两个数据中心同时失效，只有一个节点存在，不满足Raft算法大多数节点存在要求，最终将导致集群不可用及部分数据丢失，而且这种情况发生概率高于异地三数据中心损失概率；另外该架构成本较高。 

## 1.2 部署说明
下面具体介绍两地三中心架构部署详情。

![图片](https://github.com/Ryan160922/tidb-in-action/blob/master/session4/chapter4/p2.png "图 2  两地三中心配置详图")<p align="center"> 图 2  两地三中心配置详图</p>  


北京、西安两地三中心配置详解：
* 如图2所示，北京有两个机房IDC1和IDC2，机房IDC1中有三套机架RAC1、RAC2、RAC3，机房IDC2有机架RAC4、RAC5；西安机房IDC3有机架RAC6、RAC7，其中机架RAC7上有从集群用于备份的服务器。
* 如图中RAC1机架所示，TiDB、PD服务部署在同一台服务器上，还有两台TiKV服务器；每台TiKV服务器部署2个TiKV实例，即TiKV服务器上每块PCIe SSD上单独部署一个TiKV实例；RAC2、RAC4、RAC5、RAC6类似。
* 机架RAC3上安放TiDB-Server及中控+监控服务器。部署TiDB-Server，用于日常管理维护、备份使用。中控+监控服务器上部署TiDB-Ansible、Prometheus，Grafana以及恢复工具。
* 从集群配置较高，采用混合部署方式，每台服务器上部署2个TiKV实例，其中的3台部署TiDB及PD。
* 备份服务器上部署Mydumper及Dranier以PB模式输出为增量备份文件。

# 2. 两地三中心部署配置
## 2.1 inventory配置模板

inventory.ini配置模板信息
```
## TiDB Cluster Part
[tidb_servers]
TiDB-10   ansible_host=10.63.10.10     deploy_dir=/data/tidb_cluster/tidb
TiDB-11   ansible_host=10.63.10.11     deploy_dir=/data/tidb_cluster/tidb
TiDB-12   ansible_host=10.63.10.12     deploy_dir=/data/tidb_cluster/tidb
TiDB-13   ansible_host=10.63.10.13     deploy_dir=/data/tidb_cluster/tidb
TiDB-14   ansible_host=10.63.10.14     deploy_dir=/data/tidb_cluster/tidb

[tikv_servers]
TiKV-30   ansible_host=10.63.10.30     deploy_dir=/data/tidb_cluster/tikv  tikv_port=20171   labels="dc=1,rack=1,zone=1,host=30"  
TiKV-31   ansible_host=10.63.10.31     deploy_dir=/data/tidb_cluster/tikv  tikv_port=20171   labels="dc=1,rack=2,zone=2,host=31"  
TiKV-32   ansible_host=10.63.10.32     deploy_dir=/data/tidb_cluster/tikv  tikv_port=20171   labels="dc=2,rack=3,zone=3,host=32"  
TiKV-33   ansible_host=10.63.10.33     deploy_dir=/data/tidb_cluster/tikv  tikv_port=20171   labels="dc=2,rack=4,zone=4,host=33"  
TiKV-34   ansible_host=10.63.10.34     deploy_dir=/data/tidb_cluster/tikv  tikv_port=20171   labels="dc=3,rack=5,zone=5,host=34"

[pd_servers]
PD-10    ansible_host=10.63.10.10    deploy_dir=/data/tidb_cluster/pd
PD-11    ansible_host=10.63.10.11    deploy_dir=/data/tidb_cluster/pd
PD-12    ansible_host=10.63.10.12    deploy_dir=/data/tidb_cluster/pd
PD-13    ansible_host=10.63.10.13    deploy_dir=/data/tidb_cluster/pd
PD-14    ansible_host=10.63.10.14    deploy_dir=/data/tidb_cluster/pd

[spark_master]

[spark_slaves]

[lightning_server]

[importer_server]

## Monitoring Part
# prometheus and pushgateway servers
[monitoring_servers]
proth-60 ansible_host=10.63.10.60     prometheus_port=8380  deploy_dir=/data/tidb_cluster/prometheus

[grafana_servers]
graf-60   ansible_host=10.63.10.60     grafana_port=8690  grafana_collector_port=8691  deploy_dir=/data/tidb_cluster/grafana

# node_exporter and blackbox_exporter servers
[monitored_servers]
10.63.10.10
10.63.10.11
10.63.10.12
10.63.10.13
10.63.10.14
10.63.10.30
10.63.10.31
10.63.10.32
10.63.10.33
10.63.10.34 

[alertmanager_servers]
alertm  ansible_host=10.63.10.60    deploy_dir=/data/tidb_cluster/alertmanager

[kafka_exporter_servers]

## Binlog Part
[pump_servers]
pump-10    ansible_host=10.63.10.10    deploy_dir=/data/tidb_cluster/pump
pump-11    ansible_host=10.63.10.11    deploy_dir=/data/tidb_cluster/pump
pump-12    ansible_host=10.63.10.12    deploy_dir=/data/tidb_cluster/pump
pump-13    ansible_host=10.63.10.13    deploy_dir=/data/tidb_cluster/pump

[drainer_servers]

## Group variables
[pd_servers:vars]
location_labels = ["dc","rack","zone","host"]

## Global variables
[all:vars]
deploy_dir = /data/tidb_cluster/tidb

## Connection
# ssh via normal user
ansible_user = tidb

cluster_name = test

tidb_version = v3.0.5

# process supervision, [systemd, supervise]
process_supervision = systemd

timezone = Asia/Shanghai

enable_firewalld = False
# check NTP service
enable_ntpd = False
set_hostname = False

## binlog trigger
enable_binlog = True

# kafka cluster address for monitoring, example:

# zookeeper address of kafka cluster for monitoring, example:
# zookeeper_addrs = "192.168.0.11:2181,192.168.0.12:2181,192.168.0.13:2181"

# enable TLS aut hentication in the TiDB cluster
enable_tls = False

# KV mode
deploy_without_tidb = False

# wait for region replication complete before start tidb-server.
wait_replication = True

# Optional: Set if you already have a alertmanager server.
# Format: alertmanager_host:alertmanager_port
alertmanager_target = ""

grafana_admin_user = ""
grafana_admin_password = ""

### Collect diagnosis
collect_log_recent_hours = 2
enable_bandwidth_limit = True
# default: 10Mb/s, unit: Kbit/s
collect_bandwidth_limit = 10000
```

## 2.2 inventory配置详解
inventory.ini作为部署TiDB集群的重要配置文件，在配置中建议对所有的组件进行别名设置，以方便使用ansible-playbook的 -l 参数操作单一组件的单一实例。

* TiDB Servers
```
[tidb_servers]
TiDB-10  ansible_host=10.63.10.10  deploy_dir=/data/tidb_cluster/tidb 
TiDB-11  ansible_host=10.63.10.11  deploy_dir=/data/tidb_cluster/tidb 
```
* TiKV Servers<br />
设置基于tikv真实物理部署位置的label信息，方便PD进行全局管理和调度。
```
[tikv_servers]
TiKV-30 ansible_host=10.63.10.30 deploy_dir=/data/tidb_cluster/tikv1 tikv_port=20171  labels="dc=1,rack=1,zone=1,host=30"
TiKV-31 ansible_host=10.63.10.31 deploy_dir=/data/tidb_cluster/tikv1 tikv_port=20171  labels="dc=1,rack=2,zone=2,host=31"
```
* PD设置<br />
为PD设置TiKV部署位置等级信息。
```
[pd_servers:vars]
location_labels = ["dc","rack","zone","host"]
```
## 2.3 Labels设计
在两地三中心部署方式下，对于Labels的设计也需要充分考虑到系统的可用性和容灾能力，建议根据部署的物理结构来定义DC、AZ、RACK、HOST四个等级。

![图片](https://github.com/Ryan160922/tidb-in-action/blob/master/session4/chapter4/P3.png "图 3 label逻辑定义图")<p align="center"> 图 3 label逻辑定义图</p>

## 2.4 参数配置
在两地三中心的架构部署中，从性能优化的角度，建议对集群中相关组件参数进行调整。


+ tikv.yml中相关参数优化<br />
文件路径：<tidb_ansible_path>/tidb-ansible/conf/tikv.yml <br />
需要在集群安装前进行设置。

    * block-cache-size<br />
	在TiKV单机多实例环境下，需要按照以下公式调整该值。<br />
	capacity = MEM_TOTAL * 0.5 / TiKV 实例数量 <br />
	示例如下:
	```
	 Storage:
       block-cache:
         capacity: “1G”
     ```

    * 启用grpc消息压缩<br />
	由于涉及到集群中的数据在网络中传输，需要开启grpc消息压缩，降低网络流量。
	```
	server:
       grpc-compression-type: gzip
	```

+ pd.yml中相关参数优化<br />
文件路径：<tidb_ansible_path>/tidb-ansible/conf/pd.yml <br />
需要在集群安装前进行设置。

调整PD balance缓冲区大小，提高PD容忍度。
```
schedule:
  tolerant-size-ratio: 20.0
```
+ DC3 TiKV网络优化<br />
文件路径：<tidb_cluster_path>/tikv/conf/tikv.toml

修改此参数，拉长了异地副本参与选举的时间，尽量避免异地TiKV中的副本参与raft选举。建议在集群部署完毕后，为DC3的TiKV增加额外配置后重启DC3的TiKV。
```
raftstore: 
 raft-min-election-timeout-ticks= 1000 
 raft-max-election-timeout-ticks= 1020
```

+ 调度设置<br />
在集群启动后，通过PD control工具进行调度策略修改。

    * 修改TiKV raft副本数<br />
	按照安装时规划好的副本数进行设置，在本例中为5副本。
	```
	config set max-replicas 5
	```
    * 禁止向异地机房调度raft leader<br />
	当raft leader在异地数据中心时，会造成不必要的本地数据中心与异地数据中心间的网络消耗，同时由于网络带宽和延迟的影响，也会对tidb的集群性能产生影响。需要禁用raft leader的调度。
	```
	config set label-property reject-leader dc dc3
	```
	
    * 设置PD的优先级<br />
	为了避免出现异地数据中心的PD成为leader，可以将本地数据中心的PD 优先级调高(数字越大，优先级越高)，将异地的PD优先级调低。
	```
	member leader_priority PD-10 5
	member leader_priority PD-11 5
	member leader_priority PD-12 5
	member leader_priority PD-13 5
	member leader_priority PD-14 1
	```
