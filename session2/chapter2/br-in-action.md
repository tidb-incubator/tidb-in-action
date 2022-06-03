## 2.3.2 BR 实操指南

### 1. 集群部署

为了测试 BR 备份恢复的完整流程，需要提前部署好一套完整的集群，部署方案主要参考[使用Ansible部署](https://pingcap.com/docs-cn/v3.1/how-to/deploy/orchestrated/ansible/)这篇文章，简约流程如下：

1. 下载对应 ansible 版本，本次采用[v4.0.0-beta.1](https://github.com/pingcap/tidb-ansible/releases/tag/v4.0.0-beta.1)。
2. 执行 pip install -r ./requirements.txt 安装依赖。
3. 设置部署结构：
   1. 本次部署一共使用6台机器，IP 从 101-106。
   2. 101-106 为 TiKV 节点，101-103 为 PD 节点，104-106 为 TiDB 节点。

> 注意: 仅做备份恢复相关的测试，这里可以考虑不去做操作系统、文件系统等相关的参数调整

关于备份恢复中需要用到的br工具，已经附带在官方 tidb-toolkit-v4.0.0-beta.1.tar.gz 包中，如果是使用 ansible 安装，可以直接在 tidb-ansible 目录下的 downloads 中找到。

### 2. 构建测试数据

在 TiDB 中创建对应库表
```sql
MySQL [(none)]> create database br_test;
Query OK, 0 rows affected (0.11 sec)

MySQL [(none)]> use br_test;
Database changed

MySQL [br_test]>  create table br_table(id int primary key,c varchar(128),ctime timestamp);
Query OK, 0 rows affected (0.12 sec)
```

使用任意方式构造数据，比如使用 python 脚本：

```python
import mysql.connector
import time
mydb = mysql.connector.connect(
    host="xxxx.104", # 这里需要替换成 tidb-server 的 ip
    user='root',
    port=4000,
    database='br_test'
)
mycursor = mydb.cursor()

for i in range (100000):
    mycursor.execute('insert into br_table values(%s,%s,now())',(i,str(i)+'xxxx'))
    if i%1000==0:
        mycursor.execute('commit')

mycursor.execute('commit')
mycursor.close()
mydb.close()

```

接下来在 TiDB 中查看数据已经生成

```sql
MySQL [br_test]> select count(1) from br_table;
+----------+
| count(1) |
+----------+
|   100000 |
+----------+
1 row in set (0.04 sec)
```

最后总共生成的数据文件分布在 6 个 TiKV 节点上。


### 3. 备份准备

在进行备份前，有一些需要调整的配置项

1. tikv_gc_life_time 参数

```sql
# 设置 gc 时间，避免备份时间过长导致数据被回收，需要注意的是，备份完成后，需要改回来参数。

#默认值

SELECT VARIABLE_VALUE FROM mysql.tidb WHERE VARIABLE_NAME = 'tikv_gc_life_time';

10m0s

# 设置为720h

UPDATE mysql.tidb SET VARIABLE_VALUE = '720h' WHERE VARIABLE_NAME = 'tikv_gc_life_time';

# 验证修改确实成功

SELECT * FROM mysql.tidb WHERE VARIABLE_NAME = 'tikv_gc_life_time';

720h
```

2. 备份存储位置

当前备份是备份到文件系统，也就是可以通过SMB/NFS之类的挂载，备份到远程备份中心。

> 注：后续会增加S3，GCS云存储

需要注意的是，下文中执行挂载操作的，是所有的 TiKV, BR 节点，而非 TiDB，PD 所在节点。

挂载 NFS：
```bash
mount -t nfs //nfs_address/:/data  /data_nfs1
```

### 4. 备份执行

BR 命令包括备份，恢复两个操作，而备份，恢复又单独针对全库，单库，单表各有操作，因此单独讨论。

而在这些操作之前，其他共用参数单独讨论。

另外需要注意的一点是，因为备份通过 gRPC 发送相关到 TiKV，因此 BR 执行的位置，最好是 PD 节点，避免额外的麻烦。

### 5. 通用参数

--ca，--cert，--key 如果设置了TLS类连接安全认证，这些参数指定相关安全证书等。

--concurrency 每个节点执行任务的并行度，默认4。

--log-file,--log-level设置日志输出位置以及级别。

-u, --pd 链接 PD 地址，默认127.0.0.1:2379

--ratelimit 限制每个节点的速度，单位是MB

-s, --storage 指定存储位置，比方"local:///data_nfs1"

### 6. 全库备份与恢复

```br backup (full | db | table) \
  -s $BACKUP_PATH --pd $PD_ADDR \
  [--db $DB] [--table $TABLE]
```

参考命令：

```bash
bin/br backup full  --pd "192.168.122.101:2379" --storage "local:///data_nfs1/backup"
```

这个命令会备份全库到各个 TiKV 节点下的 /data_nfs1/backup 目录。

简单从日志看一下整个备份流程：

	* 从 PD 连接获取到所有 TiKV 节点。
	* 查询 infoSchema 获取元数据。
	* 发送备份请求：{"cluster_id":6801677637806839235,"start_key":"dIAAAAAAAAAvX3IAAAAAAAAAAA==","end_key":"dIAAAAAAAAAvX3L//////////wA=","end_version":415142848617512967,"concurrency":4,"storage_backend":{Backend":{"Local":{"path":"/data_nfs1/backup"}}}}"
	* 各个 TiKV 节点开始执行备份，执行命令完成后，返回到 BR 进行统计。
	* 执行表的checksum [table=`br_test`.`br_table`] [Crc64Xor=12896770389982935753] [TotalKvs=100000] [TotalBytes=4788890]
	* 保存备份的元数据。
	* 完成备份。

备份过程中，提到的元数据，最终会保存到备份目录下，其主要包含的是校验和，以及备份集的相关描述信息，包括备份集合中，每个库，表，列的逻辑排列，字符集信息等（对应的是一个 protobuf 格式的描述文件）。

备份完成后，在指定的备份目录，会最终出现命名类似5_2_23_80992061af3e5194c3f28a5b79d486c5e9db2feda1afb3f84b4ca229ddce9932_write.sst的备份集合，也就是最终的备份文件。

### 7. 恢复数据

为了简化操作，这里在原有集群上进行恢复，往往实际中是要恢复到一个全新的集群上。

首先执行以下语句删除数据：

```sql
MySQL [br_test]> drop table br_table;
```

> 注意：恢复时候，每个 TiKV 节点都需要访问到所有备份文件，如果不是共享存储，需要手动复制所有备份文件到所有节点

```br restore (full | db | table) \
  -s $BACKUP_PATH --pd $PD_ADDR \
  [--db $DB] [--table $TABLE]
```

```
 bin/br restore full  --pd "192.168.122.101:2379" --storage "local:///data_nfs1/backup"
```

从日志看：

1. 寻找并确认 PD 节点。
2. 执行DDL语句：CREATE DATABASE /*!32312 IF NOT EXISTS*/ 以及 CREATE TABLE IF NOT EXISTS。
3. 执行必要的alter auto incrementID 语句, 防止恢复后从之前的 id 分配，导致数据覆盖。
4. 切割 sst 为 Region 负责的小数据集合，分别进行数据写入。
5. 完成操作后，输出统计信息 ["Full restore summary: total restore tables: 1, total success: 1, total failed: 0, total take(s): 0.25, total size(MB): 2.28, avg speed(MB/s): 9.08, total kv: 50001"] ["restore files"=1] ["restore ranges"=1] ["split region"=6.373065871s] ["restore checksum"=45.843202ms]

执行完成后，可以看到数据已经恢复完成：

```sql

MySQL [br_test]> select count(1) from br_table;
+----------+
| count(1) |
+----------+
|    100000|
+----------+
1 row in set (0.12 sec)

```

### 8. 单库备份与恢复

单库的备份恢复参考命令如下：

备份：
```bash
bin/br backup db --db "br_test"  --pd "192.168.122.101:2379" --storage "local:///data_nfs1/backup"
```
恢复：
```bash
bin/br restore db  --db "br_test" --pd "192.168.122.101:2379" --storage "local:///data_nfs1/backup"
```


### 9. 单表备份与恢复

单库的备份恢复参考命令如下：

备份：
```bash
bin/br backup table --db "br_test"  --table "br_table"  --pd "192.168.122.101:2379" --storage "local:///data_nfs1/backup"
```
恢复：
```bash
bin/br restore table --db "br_test" --table "br_table" --pd "192.168.122.101:2379" --storage "local:///data_nfs1/backup"
```

通过上述实践，我们了解了 BR 基本用法，想要了解具体代码实现可以登录 BR 项目主页(https://github.com/pingcap/br), 欢迎提供更多的使用建议，帮助我们改进。
