# BR备份

# 集群部署

主要参考ansible文档[使用Ansible部署](https://pingcap.com/docs-cn/v3.1/how-to/deploy/orchestrated/ansible/)，简约流程如下：

1. 下载对应ansible版本，本次采用[v4.0.0-beta.1](https://github.com/pingcap/tidb-ansible/releases/tag/v4.0.0-beta.1).
2. 执行 pip install -r ./requirements.txt安装依赖。
3. 设置部署结构：
   1. 本次规划为101-106 6台机器
   2. 101-106 为tikv节点，101-103部署pd节点，104-106 为tidb节点
    > 仅做备份恢复相关的测试，这里可以考虑不去做操作系统、文件系统等相关的参数调整

关于备份恢复中需要用到的br工具，已经附带在官方tidb-toolkit-v4.0.0-beta.1.tar.gz包中，如果是使用ansible安装，可以直接在tidb-ansible目录下的downloads中找到。

# 测试数据装填

```sql
MySQL [(none)]> create database brtest;
Query OK, 0 rows affected (0.11 sec)

MySQL [(none)]> use brtest;
Database changed

MySQL [brtest]>  create table br_table(id int primary key,c varchar(128),ctime timestamp);
Query OK, 0 rows affected (0.12 sec)
```

```python
import mysql.connector
import time
mydb = mysql.connector.connect(
  host="xxxx.104",
   user='root',
   port=4000,
   database='brtest'
)

mycursor = mydb.cursor()
for i in range (100000):
    mycursor.execute('insert into br_table values(%s,%s,now())',(i,str(i)+'xxxx'))
    if i%1000==0:
        mycursor.execute('commit')
        print 1000,'commit'
mycursor.execute('commit')
mycursor.close()
mydb.close()
```

```sql
MySQL [brtest]> select count(1) from br_table;
+----------+
| count(1) |
+----------+
|   100000 |
+----------+
1 row in set (0.04 sec)
```

总共六个tikv节点，每个节点数据目录大小大约在2.3G左右
```bash
du -sh /home/tidb/deploy/data
2.3G    /home/tidb/deploy/data
```
# 一些需要调整的配置项目

## tikv_gc_life_time参数
```sql
# 设置gc时间，避免备份时间过长导致数据被回收，需要注意的是，备份完成后，需要改回来参数。

SELECT VARIABLE_VALUE FROM mysql.tidb WHERE VARIABLE_NAME = 'tikv_gc_life_time';

10m0s #默认值

UPDATE mysql.tidb SET VARIABLE_VALUE = '720h' WHERE VARIABLE_NAME = 'tikv_gc_life_time';

# 设置为720h

SELECT * FROM mysql.tidb WHERE VARIABLE_NAME = 'tikv_gc_life_time';

720h # 验证修改确实成功

```

## 备份存储位置

当前备份是备份到文件系统，也就是可以通过SMB/NFS之类的挂载，备份到远程备份中心。

> 注：后续会增加S3，WebDAV之类的存储接口

需要注意的是，下文中执行挂载操作的，是所有的tikv节点，而非tidb，pd，br所在节点。

挂载NFS：
```bash
mount -t cifs -o username=user,password=passwd -l //xxxx.1.8/data /data_smb1
```

挂载NFS：
```bash
mount -t nfs //xxxx.1.8/:/data  /data_nfs1
```

# 备份执行

br命令包括备份，恢复两个操作，而备份，恢复又单独针对全库，单库，单表各有操作，因此单独讨论。

而在这些操作之前，其他共用参数单独讨论。

另外需要注意的一点是，因为备份通过rpc发送相关命令，因此br执行的位置，最好是pd节点，避免额外的麻烦。

## 通用参数

--ca，--cert，--key 如果设置了TLS类连接安全认证，这些参数指定相关安全证书等。

--checksum 运行任务完成后，执行checksum，默认打开。

--concurrency 每个节点执行任务的并行度，默认4。

--log-file,--log-level设置日志输出位置以及级别。

-u, --pd设置pd地址，默认127.0.0.1:2379

--ratelimit限制每个节点的速度，单位是MB

-c, --send-credentials-to-tikv   Whether send credentials to tikv (default true)

--status-addr设置监控地址，方便第三方监控进度

-s, --storage 指定存储位置，比方"local:///data_nfs1"

## 全库备份与恢复

参考命令：

```bash
bin/br backup full  --pd "192.168.122.101:2379" --storage "local:///tmp/backup"
```

这个命令会备份全库到各个tikv节点下的/tmp/backup目录。

简单从日志看一下整个备份流程：

1. 从pd连接获取到所有pd节点。
2. 查询infoschema获取元数据。
3. 发送备份请求：{"cluster_id":6801677637806839235,"start_key":"dIAAAAAAAAAvX3IAAAAAAAAAAA==","end_key":"dIAAAAAAAAAvX3L//////////wA=","end_version":415142848617512967,"concurrency":4,"storage_backend":{Backend":{"Local":{"path":"/tmp/backup"}}}}"
4. 各个节点开始执行备份，执行命令完成后，返回到br进行统计。
5. 执行表的checksum [table=`brtest`.`br_table`] [Crc64Xor=12896770389982935753] [TotalKvs=100000] [TotalBytes=4788890] 
6. 保存备份的元数据。
7. 完成备份。

备份过程中，提到的元数据，最终会保存到备份目录下，其主要包含的是校验和，以及备份集的相关描述信息，包括备份集合中，每个库，表，列的逻辑排列，字符集信息等（对应的是一个json格式的描述文件）。

备份完成后，在指定的备份目录，会最终出现命名类似5_2_23_80992061af3e5194c3f28a5b79d486c5e9db2feda1afb3f84b4ca229ddce9932_write.sst的备份集合，也就是最终的备份文件。

现在来说恢复。

首先执行以下语句删除数据：

```sql
MySQL [brtest]> delete from br_table where id>50000;
Query OK, 49999 rows affected (0.59 sec)

MySQL [brtest]> select count(1) from br_table;
+----------+
| count(1) |
+----------+
|    50001 |
+----------+
1 row in set (0.07 sec)

MySQL [brtest]> commit;
Query OK, 0 rows affected (0.00 sec)

```

可以看到数据已经被删除了，现在来进行数据恢复：

> 注意1：恢复时候，必须确保目标库，表并不存在，否则会在恢复时候报错为Error: failed to validate checksum
> 注意2：恢复时候，每个rikv节点都需要访问到所有备份文件，如果不是共享存储，需要手动复制所有备份文件到所有节点

```
 bin/br restore full  --pd "192.168.122.101:2379" --storage "local:///tmp/backup"
```

从日志看：

1. 寻找并确认pd节点
2. 执行DDL语句：CREATE DATABASE /*!32312 IF NOT EXISTS*/ 以及 CREATE TABLE IF NOT EXISTS 
3. 执行必要的auto incrment等alter语句。
4. 切割sst为region负责的小数据集合，分别进行数据写入。
5. 完成操作后，输出统计信息 ["Full restore summary: total restore tables: 1, total success: 1, total failed: 0, total take(s): 0.25, total size(MB): 2.28, avg speed(MB/s): 9.08, total kv: 50001"] ["restore files"=1] ["restore ranges"=1] ["split region"=6.373065871s] ["restore checksum"=45.843202ms]

执行完成后，可以看到数据已经恢复完成：

```sql

MySQL [brtest]> drop table br_table; # 进行恢复前先删除需要恢复的表

MySQL [brtest]> select count(1) from br_table;
+----------+
| count(1) |
+----------+
|    100000|
+----------+
1 row in set (0.12 sec)

```

## 单库备份与恢复

单库的备份恢复参考命令如下：

备份：

```bash
bin/br backup db --db "brtest"  --pd "192.168.122.101:2379" --storage "local:///tmp/backup"
```
恢复：
```bash
bin/br restore db  --db "brtest" --pd "192.168.122.101:2379" --storage "local:///tmp/backup"
```


## 单表备份与恢复

单库的备份恢复参考命令如下：

备份：

```bash
bin/br backup table --db "brtest"  --table "br_table"  --pd "192.168.122.101:2379" --storage "local:///tmp/backup"
```
恢复：
```bash
bin/br restore table --db "brtest" --table "br_table" --pd "192.168.122.101:2379" --storage "local:///tmp/backup"
```

# 目前的一些建议

1. 备份集合带上时间属性，或者可以自定义命名
2. 备份完成后，会有多有的干扰错误日志输出，建议处理
3. 恢复时候，目标表如果存在，会报错failed to validate checksum，建议提前检查
