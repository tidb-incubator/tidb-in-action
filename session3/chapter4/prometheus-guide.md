# Prometheus 简单介绍 
## prometheus 简介
TiDB  使用开源时序数据库  Prometheus  作为监控和性能指标信息存储方案，使用 Grafana  作为可视化组件进行展示。

Prometheus 狭义是上软件本身，即 prometheus server，广义上是基于 prometheus server 为核心的各类软件工具的生态。除 prometheus server 和 grafana 外，Prometheus 生态常用的组件还有 alertmanager、pushgateway 和非常丰富的各类 exporters。

prometheus server 自身是一个时序数据库，相比使用 MySQL 做为底层存储的 zabbix 监控，拥有非常高效的插入和查询性能，同时数据存储占用的空间也非常小。另外不同于 zabbix，prometheus server 中的数据是从各种数据源主动拉过来的，而不是客户端主动推送。如果使用 prometheus server 要接收推送的信息，数据源和 prometheus server 中间需要使用 pushgateway。

Prometheus 监控生态非常完善，能监控对象非常丰富。详细的 exporter 支持对象可参考官方介绍 [exporters列表](https://prometheus.io/docs/instrumenting/exporters/ ) 。

Prometheus 可以监控的对象远不止官方 exporters 列表中的产品，有此产品原生支持不在上面列表，如 TiDB; 有些可以通过标准的 exporter 来监控一类产品，如 snmp_exporter; 还有些可以通过自己写个简单的脚本往 pushgateway 推送；如果有一定开发能力，还可以通过自己写 exporter 来解决。同时有些产品随着版本的更新，不需要上面列表中的 exporter 就可以支持，比如 ceph。

随着容器和 kurbernetes 的不断落地，以及更多的软件原生支持 Prometheus，相信很 Prometheus 会成为监控领域的领军产品。

## 架构介绍
Prometheus 的架构图如下：

![图片](https://uploader.shimo.im/f/hjfzbrnBIdkMGNdc.png!thumbnail)


Prometheus 生态中 promtheus server 软件用于监控数据库的存储、检索，以及告警消息的推送，是 Prometheus 生态最核心的部分。

Alertmanger 负责接收 prometheus 软件推送的告警，并将告警经过分组、去重、等处理后，按告警标签内容路由后，通过邮件、短信、企业微信、钉钉、webhook 等发送给接收者。 	

大部分软件监控时还需要部署一个 exporter 做为 agent 来采集数据，但是有部分软件原生支持 Prometheus，比如 TiDB 的部分组件，在不用部署 exporter 的情况下就可以直接采集监控数据。

Prometheus 数据查询的语言 PromQL， 可以通过 prometheus server 的 web UI，在浏览器上直接编写 PromQL 检索，也可以将 PromQL 固化到 grafana 的报表中做动态的展示，还可以通过 API 接口做更丰富的自定义功能。

Prometheus 除了可以采集静态的 exporters 之外，还可要通过 Service discover 的方式监控各种动态的目标，如 kubernetes 的 node,pod,service 等。

除 exporter 和 service discovery 之外，还可以写脚本做一些自定义的采集，然后通过 push 的方式推送到 pushgateway，pushgateway 对于 prometheus server 来说就是一个特殊的 exporter，prometheus server 可以像抓取其他 exporters 一样抓取 pushgateway 的信息。

## 安装运行
Prometheus 可以运行在 kubernetes 中，也可以运行中虚拟机中。Prometheus 的大部分组件都已经有编译好的二进制文件和 docker 镜像。对于二进制文件，从官方网站下载解压后就可以启动运行，命令如下：

prometheus --config.file=conf/prometheus.yml

建议将二进制文件做成 systemd 的一个服务，这部分可以参考 [TiDB 上运行 prometheus 的方式](https://pingcap.com/docs-cn/stable/how-to/monitor/monitor-a-cluster/#%E9%83%A8%E7%BD%B2-prometheus-%E5%92%8C-grafana) 。

### **Prometheus server**** ****配置文件**
prometheus server 的配置文件是 yaml 格式，由参数 --config.file 去指定需要使用的配置文件。配置文件一般命名为 prometheus.yml

**常用配置**

配置文件示例：

```
global:    

  scrape_interval: 15s

	scrape_timeout: 10s

  external_labels:

	monitor: 'codelab-monitor'

rule_files:

  - rules/centos7.rules.yml

  - rules/mariadb.rules.yml

 

alerting:

  alertmanagers:

  - static_configs:

    - targets:

      - 21.129.127.3:9093

scrape_configs:

   - job_name: 'prometheus'

    scrape_interval: 5s

 

    static_configs:

      - targets: ['localhost:9090']

	- job_name: node

    file_sd_configs:

      - files:

        - conf.d/centos.yml
```


配置文件说明：



- global:  指的是全局变更
- scrape_interval: 抓取目标监控信息的间隔，默认 15 秒
- scrape_timeout: 抓取时的超时时间，默认 10 秒
- external_labels: 额外添加的标签，这个标签可以在多个外部系统流转，如：federation, remote storage, Alertmanager
- rule_files:  这个写的是生成告警规则的配置文件，具体写法会在后 alertmanger 章节介绍 
- alerting:  这个是用来配置 alertmanager 地址，可以写多个 alertmanager 的地址
- scrape_configs： 从这开始，后面是采集对象的配置
- job_name：可以定义多个 job，每个 job 里有一类的采集对象
- static_configs: 后面可以写一些静态的监控对象
- targets： 要抓取的具体对象（instance)
- file_sd_configs: 如果监控对象过多，可使用这种方式写到独立的文件中


**告警规则配置**

告警规划配置文件示例：


```
groups:

- name: alert.rules

  rules:

   - alert: InstanceDown

    expr: up == 0

    for: 1s

    labels:

      level: emergency

    annotations:

      summary: "该实例抓取数据超时"

      description: "项目：{{ $labels.project }} , service: {{ $labels.service}}" 当前值{{ $value }}
```


 

**说明**：


- groups： 标记当前所有的告警规划为同一组
- name: 这告警组的自定义名称
- alert：告警规则的名称
- expr：告警的表达式
- for: 问题发生后保持多长时间再推送给
- alertmanager，调低时间可以增加告警的敏感度，调高会减少告警毛刺。
- labels： 可以加一些自定义的键值对标签
- annotations: 可以加一些描述信息



# Prometheus 在 TiDB 的部署架构
## 部署架构介绍
TiDB 已经原生支持 Prometheus， 在 TiDB 旧版本中，TiDB 的监控信息是由各 TiDB 的各个组件主动上报给 pushgateway，再由 prometheus server 去 pushgateway 上主动抓取监控信息。

从 TiDB 2.1 版本开始由主动上报变成主动暴露 [Metrics 接口](https://pingcap.com/docs-cn/stable/how-to/monitor/monitor-a-cluster/#%E4%BD%BF%E7%94%A8-metrics-%E6%8E%A5%E5%8F%A3) ，由 prometheus server 主动抓取信息， 这样的架构更符合 Prometheus 的设计思想，整个数据采集路径少一层 pushgateway。 数据采集完成后由于 grafana 做报表展示，同时告警信息主动推动 alertmanager，再 altermanager 将告警推送到不同的消息渠道。

![图片](https://uploader.shimo.im/f/IgJZ27rPzZERnBhT.png!thumbnail)

# Prometheus 表达式在 TiDB 的应用 
## PromQL

PromQL (Prometheus Query Language)是 Promehteus 提供的函数查询语言，可以进行实时查询，也可以通过函数做聚合运算。

### 数据类型

Promethes 中的数据类型分 4 类：

- Instant vector - 一个时间点的时序数据;
- Range vector - 一个时间段的时序数据;
- Scalar** -数字，浮点值;
- String** - 字符串，当前还没有用。

### prometheus 数据格式

下面看看 prometheus 里存储的记录是什么样的，示例如下，这是使用 web UI ( [http://prometheus-server:9090/graph)](http://21.129.127.3:9090/graph) 查询出的结果以 Table 格式展示的内容：

up{alert_lev="0",,instance="21.129.14.103:2998",job="hadoop",project="dtl",service="hadoop"}  1

![图片](https://uploader.shimo.im/f/YP6KEmwiAFwt3jk7.png!thumbnail)


**说明：**

up: 是一条具体的时序记录名字，同时 up 又是一条特殊的时序名称，他是 Prometheus 对每个监控对象自动生成的，指示该对象一起停状态，1 是可连通，0 是不可能连通（注意，0 不一定是服务挂了，也有可能是获取记录的时候超时了）。

instance,job,project,service,alert_lev 都是该条的记录的标签，相对于关系型数据库中的字段。其中 instance 和 job 是基于 prometheus.yaml 中的内容自动生成的，project,service,alert_lev 是用户自定义的标签。instance 一般是 prometheus 里的 target，但是也可以在标签里重写。

	 

最后的 1 是这条记录在查询的时间的结果



### Instant vector 查询

这种查询直接写时序名称就可查出数据，

http_requests_total

同时还可以在{}中加一些标签做为条件

http_requests_total{job="prometheus",group="canary"}

一个标签还可以匹配多个值 

http_requests_total{job=~"prometheus|node",group="canary"}

还可以使用匹配不需要的

http_requests_total{job!~"prometheus|node",group!="canary"}

可以匹配正则表达式

up{mysql=~".+"}  #匹配所以包含 mysql 的 up 时序数据

还可以使用算术运算和比较运算进一步过滤结果

Hadoop_DataNode_BytesWritten{job="hadoop"}/1024/1024 > 500

### Range vector 查询

Range vector 查询类似于 instance vector 查询 ，但是加通过[]加上限定时间范围，时间单位有以下级别：

· s - seconds

· m - minutes

· h - hours

· d - days

· w - weeks

· y - years

示例如下

Hadoop_DataNode_BlocksRead{ instance="21.129.14.104:2998"}[1m]

通常时间范围查询时会和函数一起使用，比如 rate() 函数

rate(node_cpu_seconds_total{mode='user',instance='21.129.20.161:9100'}[5m])

![图片](https://uploader.shimo.im/f/0yRfZZ5NB28CLRQO.png!thumbnail)

### Offset 查询

使用的 offset 查询的结果是显示的时序往前偏移的值,示例如下

sum((tidb_server_query_total{result="OK"}  offset 1d)) 

 

### TiDB 监控中常用函数

**rate() 和 irate()**

这两个函数用于计数器（counter）类型的数据，这类数据会一直增加，使用这两个函数后，将展示一定时间范围内的变化情况，但它俩的计算方式有差异，irate()基于时间范围内连续的两个时间点。而 rate()是基于时间范围内的所有时间点，所以 irate()展示的数据更为精确些，做图毛刺会更明显，示例如下：

irate(node_cpu_seconds_total{mode='user',instance='21.129.20.161:9100'}[5m])

![图片](https://uploader.shimo.im/f/8fbO5UM0gz8h10Dm.png!thumbnail)

**increase()**

将会计算出指定时间范围内的变化量，用法如下：

increase(http_requests_total{job="api-server"}[5m])

**histogram_quantile()**

累积直方图百分位数， 用法 histogram_quantile(φ float, b instant-vector)，百分位是介于0和1之间。这个函数计算的结果是直方图中指定百分比的最大值。比如0.95的百分位的结果是200,说明所有数据中，小于200的占总数据的比例为95%。使用示例如下：

histogram_quantile(0.95, sum(rate(tidb_server_handle_query_duration_seconds_bucket[1m])) by (le, instance))

**sum(),avg()**

聚合函数，使用示例

sum(tikv_store_size_bytes{instance=~"$instance", type="available"}) by (instance)

### rate() 函数应用
显示 1 分钟范围内 IO 使用率，由于 node_disk_io_time_ms 是个 counter 类型的，所以使用 rate()函数

rate(node_disk_io_time_ms[1m]) / 1000

![图片](https://uploader.shimo.im/f/EBWYQHnKI0YbhfR0.png!thumbnail)

### increase() 函数应用
以 bypte 为聚合条件，显示 1 分钟内 Failed Query OPM 总数

sum(increase(tidb_server_execute_error_total[1m])) by (type)

![图片](https://uploader.shimo.im/f/2ktKfNUoS3kOYeOl.png!thumbnail)

### histogram_quantile 在 TiDB 中的应用
监控 duration 的百分位，百分们是 0.99，直方图的桶是以 le,instance 组合为单位。

histogram_quantile(0.99, sum(rate(tidb_server_handle_query_duration_seconds_bucket[1m])) by (le, instance))

![图片](https://uploader.shimo.im/f/wkykOxpSCYEeGfp2.png!thumbnail)

### 聚合函数应用
显示 cpu 的使用率，计算方式是先求 idle 空间 CPU 的，然后再同 100 求差异，聚合单们是 instance 标签。

100 - avg by (instance) (irate(node_cpu{mode="idle"}[1m]) ) * 100

![图片](https://uploader.shimo.im/f/DPR4zQdRs742hGzm.png!thumbnail)

## **Prometheus 报警在 TiDB 的应用 **
##  TiDB 报警规则
本节介绍了 TiDB 组件的报警项。根据严重级别，报警项可分为三类，按照严重程度由高到低依次为：紧急级别、重要级别、警告级别。

### 紧急级别报警项
紧急级别的报警通常由于服务停止或节点故障导致，此时需要马上进行人工干预操作。告警规则里的标签 level: emergency，告警示例：

> TiDB_schema_error
> 
> 报警规则：
> 
> increase(tidb_session_schema_lease_error_total{type="outdated"}[15m]) > 0
> 
> 规则描述：
> 
> TiDB 在一个 Lease 时间内没有重载到最新的 Schema 信息。如果 TiDB 无法继续对外提供服务，则报警。
> 
> 处理方法：
> 
> 该问题通常由于 TiKV Region 不可用或超时导致，需要看 TiKV 的监控指标定位问题。

### 重要级别报警项
对于重要级别的报警，需要密切关注异常指标。告警规则里的标签 level: critical，告警示例：

> TiDB_server_panic_total
> 
> 报警规则：
> 
> increase(tidb_server_panic_total[10m]) > 0
> 
> 规则描述：
> 
> 发生崩溃的 TiDB 线程的数量。当出现崩溃的时候会报警。该线程通常会被恢复，否则 TiDB 会频繁重启。
> 
> 处理方法：
> 
> 收集 panic 日志，定位原因。

### 警告级别报警项
警告级别的报警是对某一问题或错误的提醒。告警规则里的标签 level: warning，

告警示例：

> TiDB_memory_abnormal
> 
> 报警规则：
> 
> go_memstats_heap_inuse_bytes{job="tidb"} > 1e+10
> 
> 规则描述：
> 
> 对 TiDB 内存使用量的监控。如果内存使用大于 10 G，则报警。
> 
> 处理方法：
> 
> 通过 HTTP API 来排查 goroutine 泄露的问题。

更多关于 TiDB 报警规划，以及 TiDB 详细告警的处理方法，请参考[ 官网介绍](https://pingcap.com/docs-cn/stable/reference/alert-rules/) 。

##  alertmanager 告警路由
由于往外发送告警需要邮箱、短信、企业微信等外部消息通道打通，一般企业内部都有各自不同的安全要求和操作规范。另外像短信接口并不是统一标准的，大部分也不是原生支持 prometheus 的，所以需要用户自己编写适配脚本，以 webhook 的方式与 alertmanger 适配。

建议使用 TiDB 时，用户自己创建一个独立的 alertmanager，用于接收来自不同 prometheus server 的告警，统一集中路由发送，即可以有效安全管理，也可以减少用户自己的部署操作。

**alertmanager 配置 TiDB 路由示例**

路由部署配置：  


```
- match:

      env: test-cluster

      level: emergency

    receiver: tidb-emergency

    group_by: [alertname, cluster, service]
```


说明：

- match: 是一条路由规划
- env: test-cluster，level: emergency： 这是从 Prometheus 过来的记录所携带的标签，如果能够匹配该标签，则符合当前这条路由规则
-  receiver： 接收人，和后面接收部分的 name 一致
- group_by: 告警做分组聚合的标签，后面括号内的是 prometheus 记录所携带的标签。

接收部分示例


```
- name: 'tidb-emergency' 

  webhook_configs:

  - url: 'xxxx'

  wechat_configs:

  - corp_id: 'xxxxx'

    to_party: 'xxx'

    agent_id: 'xxxx'

    api_url: 'https://qyapi.weixin.qq.com/cgi-bin/'

    api_secret: 'xxxxxx'
```


说明：

- name： 和上面路由规则的 receiver 对应一致
- webhook_configs： 以 webhook 的方式发送
- wechat_configs： 以企业微信的方式发送，具体要求参考 [企业微信](https://work.weixin.qq.com) 文档；
- 由于默认的告警发送的内容过多，包含注释等信息，影响可读性。建议用户自己写 webhook 的方式发送告警。

告警示例：
<img style="width:50px;height:50px" src="https://uploader.shimo.im/f/J99wQmz2aG49iuQT.png"  alt="真棒" align=center />
![图片](https://uploader.shimo.im/f/J99wQmz2aG49iuQT.png!thumbnail){:height="30" width="100"}![图片](https://uploader.shimo.im/f/PvMs4K4IERQGIxou.png!thumbnail)

