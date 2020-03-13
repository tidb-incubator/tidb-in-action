# 5.1.2 DM 同步分库分表 MySQL 到 TiDB 的实践

## 5.1.2.1 DM 分库分表安装部署实战

本实战模拟企业生产环境阿里云 DRDS 中间件对业务表进行分库分表后，这边使用 DM 工具将线上分库分表数据同步至 TiDB 中：
1. 解决跨业务跨库的数据查询分析
2. 结合 DBA 管理平台提供数据排错查询减少因人为慢查询引起的线上故障
3. 线上仅保留半年数据，数据归档至 TiDB 保留。

有部分的分库分表使用了自增长主键 ID，使用 DM 的自增长主键重算机制，解决了上游分库分表合并到下游单表时的主键冲突问题。要说明的是这个功能还是有所限制，上游在设计自增主键的时候最好还是使用全局自增服务组件来做比较好。

此外 dm 在 loader 恢复时支持断点操作，支持幂等 binlog 重做，不用担心恢复中意外而前功尽弃。

### 1. 环境说明

实验环境宿主机的用户名、密码与数据库的用户名、密码一致。

| 主机 IP| 操作系统| 应用部署|说明|帐号密码|
|----|----|----|----|----|
| 192.168.128.131   | centos7.3 x86_64   | MySQL5.7   | 3306 端口   | root/password   |
| 192.168.128.131   | centos7.3 x86_64   | MySQL5.7   | 3307 端口   | root/password   |
| 192.168.128.131   | centos7.3 x86_64   | MySQL5.7   | 3308 端口   | root/password   |
| 192.168.128.132   | centos7.3 x86_64   | dm-master/dmctl   | 中控机   | root/password   |
| 192.168.128.133   | centos7.3 x86_64   | dm-worker   | dm-worker   | root/password   |
| 192.168.206.28   | centos7.3 x86_64   | TiDB 库   | 4000 端口   | root/password   |

### 2. 准备工作

**第一步：使用 root 账号登录中控机 192.168.128.132 上并安装依赖包**

```
[tidb@dmmaster ~]# yum -y install epel-release git curl sshpass 
[tidb@dmmaster ~]# yum -y install python-pip
```
**第二步：在中控机上创建 tidb 用户并生成 SSH 密钥**

1、创建 tidb 用户

```
[tidb@dmmaster ~]# useradd -m -d /home/tidb tidb
```
2、为 tidb 用户设置密码
```
[tidb@dmmaster ~]# echo "password" | passwd --stdin tidb
```
3、为 tidb 用户设置免密使用 sudo
```
[tidb@dmmaster ~]# echo "tidb ALL=(ALL) NOPASSWD: ALL" >>/etc/sudoers
```
4、切换至 tidb 用户 home 目录并生成 SSH 密钥
```
[tidb@dmmaster ~]# su - tidb
[tidb@dmmaster ~]$ ssh-keygen -t rsa
一路按回车生成密钥
```
**第三步：使用 tidb 用户在中控机下载 DM-Ansible**

```
[tidb@dmmaster ~]$ wget https://download.pingcap.org/dm-ansible-v1.0.2.tar.gz
```
**第四步：安装 DM-Ansible 及其依赖至中控机**

```
[tidb@dmmaster ~]$ tar -xf dm-ansible-v1.0.2.tar.gz
[tidb@dmmaster ~]$ mv dm-ansible-v1.0.2.tar.gz dm-ansible
[tidb@dmmaster ~]$ cd /home/tidb/dm-ansible
[tidb@dmmaster dm-ansible]$ sudo pip install --upgrade pip
[tidb@dmmaster dm-ansible]$ sudo pip install -r ./requirements.txt
```
**第五步: 在中控机上配置 ssh 互信和 sudo 规则**

```
[tidb@dmmaster dm-ansible]$ cat hosts.ini 
[servers]
192.168.128.132
192.168.128.133
[all:vars]
username = tidb
ansible_ssh_port = 22
ntp_server = ntp.aliyun.com
```
dm-worker 主机建立 tidb 用户并完成互信，此处输入远程机器的 root 密码 password

```
[tidb@dmmaster dm-ansible]$ ansible-playbook -i hosts.ini create_users.yml -u root -k
SSH password: 
PLAY [all] 
********************************************************************
TASK [create user] 
********************************************************************
changed: [192.168.128.133]
TASK [set authorized key] 
********************************************************************
changed: [192.168.128.133]
TASK [update sudoers file] ********************************************************************
changed: [192.168.128.133]
PLAY RECAP
********************************************************************
192.168.128.133    : ok=3    changed=3    unreachable=0    failed=0 
```
**第六步：下载 DM 及监控组件安装包至中控机**

```
[tidb@dmmaster dm-ansible]$ ansible-playbook local_prepare.yml
PLAY [do local preparation] ********************************************************************
TASK [download : Stop if ansible version is too low, make sure that the Ansible version is Ansible 2.5.0 or later, otherwise a compatibility issue occurs.] 
********************************************************************
ok: [localhost] => {
    "changed": false, 
    "msg": "All assertions passed"
}
此处打印日志省略
localhost  : ok=13   changed=5    unreachable=0    failed=0  
```

**第七步：上游 MySQL 数据库建立 TiDB 数据迁移专用帐户**

```
root@localhost >grant Reload,Replication slave, Replication client,select on *.* to tidb@'%' IDENTIFIED by 'tidb@2020';
```
**第八步：使用 dmctl 加密上下游数据库登录密码**

```
[tidb@dmmaster bin]$ dmctl -encrypt tidb@2020
BXTTVvKeWhXgAefaFRNoN0BS4XjZ85uZByE=
```
### 3. 部署 dm-worker
**第一步：编写 inventory.ini 文件**

此处我们主要定义 dm-master 和 dm-worker，本章采取单台部署多台 dm-worker。

```
[tidb@dmmaster dm-ansible]$ cat inventory.ini
## DM modules
[dm_master_servers]
dm_master ansible_host=192.168.128.132
[dm_worker_servers]
dm_worker3306 ansible_host=192.168.128.133 deploy_dir=/data/mysql3306 dm_worker_port=13306 source_id="mysql3306" server_id=13306 mysql_host=192.168.128.131 mysql_user=tidb mysql_password=BXTTVvKeWhXgAefaFRNoN0BS4XjZ85uZByE mysql_port=3306
dm_worker3307 ansible_host=192.168.128.133 deploy_dir=/data/mysql3307 dm_worker_port=13307 source_id="mysql3307" server_id=13307 mysql_host=192.168.128.131 mysql_user=tidb mysql_password=BXTTVvKeWhXgAefaFRNoN0BS4XjZ85uZByE mysql_port=3307
dm_worker3308 ansible_host=192.168.128.133 deploy_dir=/data/mysql3308 dm_worker_port=13308 source_id="mysql3308" server_id=13308 mysql_host=192.168.128.131 mysql_user=tidb mysql_password=BXTTVvKeWhXgAefaFRNoN0BS4XjZ85uZByE mysql_port=3308
[dm_portal_servers]
dm_portal ansible_host=192.168.128.132
## Monitoring modules
[prometheus_servers]
prometheus ansible_host=192.168.128.132
[grafana_servers]
grafana ansible_host=192.168.128.132
[alertmanager_servers]
alertmanager ansible_host=192.168.128.132
## Global variables
[all:vars]
cluster_name = dm-cluster
ansible_user = tidb
ansible_port = 5622
dm_version = v1.0.2
deploy_dir = /home/tidb/deploy
grafana_admin_user = "admin"
grafana_admin_password = "admin"
```
```
inventory.ini 文件参数说明
[dm_master_servers]  dm-master 选项，用于定义哪台主机是中控 dm-master
[dm_worker_servers]  dm-worker 选项，用于定义 dm-worker 服务
----dm_worker3306    dm服务全局唯一标签，配合ansible-playbook -l 参数使用
----ansible_host     指定 dm-worker 部署在哪台主机
----dm_worker_port   指定 dm-worker 启动服务端口号
----deploy_dir       指定 dm-worker 部署安装目录
----source_id        指定 dm-worker 的 source-id
----mysql_host       上游MySQL主机地址
----mysql_user       上游MySQL登录用户   
----mysql_port       上游MySQL服务端口
----mysql_password   上游MySQL登录密码(必须dmctl加密后的值,参考2.2章第八步)
```
**第二步：执行安装并启动 dm-worker**

安装 dm-worker:

```
[tidb@dmmaster dm-ansible]$ ansible-playbook deploy.yml
PLAY RECAP **********************************************************************
alertmanager    : ok=13   changed=7    unreachable=0    failed=0   
dm_master       : ok=13   changed=8    unreachable=0    failed=0   
dm_portal       : ok=12   changed=5    unreachable=0    failed=0   
dm_worker3306   : ok=14   changed=2    unreachable=0    failed=0   
dm_worker3307   : ok=14   changed=2    unreachable=0    failed=0   
dm_worker3308   : ok=14   changed=2    unreachable=0    failed=0   
grafana         : ok=17   changed=10   unreachable=0    failed=0   
localhost       : ok=4    changed=3    unreachable=0    failed=0   
prometheus      : ok=15   changed=13   unreachable=0    failed=0
#出现以上信息表示部署成功
```
启动 dm-worker:

```
[tidb@dmmaster dm-ansible]$ ansible-playbook start.yml 
PLAY RECAP **********************************************************************
alertmanager   : ok=10   changed=1    unreachable=0    failed=0   
dm_master      : ok=10   changed=1    unreachable=0    failed=0   
dm_portal      : ok=9    changed=1    unreachable=0    failed=0   
dm_worker3306  : ok=11   changed=1    unreachable=0    failed=0   
dm_worker3307  : ok=11   changed=1    unreachable=0    failed=0   
dm_worker3308  : ok=11   changed=1    unreachable=0    failed=0   
grafana        : ok=13   changed=1    unreachable=0    failed=0   
localhost      : ok=4    changed=0    unreachable=0    failed=0   
prometheus     : ok=13   changed=4    unreachable=0    failed=0 
#出现以上信息表示 dm 启动成功，此时已经开始同步上游 binlog 至 dm 机器中。
```
### 4. 配置 & 启动 task
**上游数据库结构合并至下游 TiDB 说明**

|上游分库|上游分表|下游合并库名|下游合并表名|
|----|----|----|----|
| shard_db01   | shard_tb01   | merge_db   | merge_tb   |
| shard_db02   | shard_tb02   |    |    |
| shard_db03   | shard_tb03   |    |    |
| shard_db04   | shard_tb04   |    |    |
| shard_db05   | shard_tb05   |    |    |
| shard_db06   | shard_tb06   |    |    |

**上游数据库准备**

```
CREATE TABLE shard_tb01~06 (
  id bigint(20) NOT NULL AUTO_INCREMENT COMMENT'主键ID',
  uid bigint(20) NOT NULL COMMENT '用户ID',
  uname varchar(10) NOT NULL DEFAULT '' COMMENT '用户名',
  gender tinyint(1) NOT NULL DEFAULT '0' COMMENT '性别 0-男、1-女',
  shard varchar(50) NOT NULL DEFAULT '' COMMENT '分片信息',
  mobile varchar(15) NOT NULL DEFAULT '' COMMENT '联系电话',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分库分表';
INSERT INTO shard_db01.shard_tb01 
(uid,uname,gender,shard,mobile) VALUES
('10001','tb01001','0','shard_db01_tb01','136******17'),('10002','tb01002','1','shard_db01_tb01','136******17');
INSERT INTO shard_db02.shard_tb02 
(uid,uname,gender,shard,mobile) VALUES ('20001','tb02001','1','shard_db02_tb02','136******33'), ('20002','tb02002','0','shard_db02_tb02','139******63');
INSERT INTO shard_db03.shard_tb03 
(uid,uname,gender,shard,mobile) VALUES ('30001','tb03001','0','shard_db03_tb03','135******73'),
('30002','tb03002','0','shard_db03_tb03','139******46');

INSERT INTO shard_db04.shard_tb04 
(uid,uname,gender,shard,mobile) VALUES ('40001','tb04001','0','shard_db04_tb04','137******91'),('40002','tb04002','1','shard_db04_tb04','138******91');
INSERT INTO shard_db05.shard_tb05 
(uid,uname,gender,shard,mobile) VALUES ('50001','tb05001','1','shard_db05_tb05','158******96'),('50002','tb05002','0','shard_db05_tb05','188******92');
INSERT INTO shard_db06.shard_tb06 
(uid,uname,gender,shard,mobile) VALUES ('60001','tb06001','1','shard_db06_tb06','178******98'),('60002','tb06002','1','shard_db06_tb06','175******31');
```

**合库合表 task 的 yaml 文件**

```
[tidb@tidb-dm-4-0-95 task]$ cat shardmysql_to_tidb.yaml
name: "shard_to_tidb"  #task 名称，必须全局唯一
is-sharding: true      #上游是不是进行了分库分表库
task-mode: "all"       #迁移同步方式 full-全量、incremental-增量、all-全量+增加
meta-schema: "tidb_meta"   #定义下游保留迁移点位信息库名称
remove-meta: false
target-database:                                   
  host: "192.168.206.28" #下游 TiDB 主机 IP
  port: 4000             #TiDB 访问端口
  user: "root"           #TiDB 登录用户
  password: "vLnqQt44rNFHSxA"    #使用 dmctl 加密的登录密码
mysql-instances:
-
  source-id: "mysql3306"   #必须与 inventory.ini 中对应的 source-id 一致
  route-rules: ["rt000","rt001"]      #库表合并规则
  filter-rules: ["ymdd-filter-rule"]  #过滤规则
  mydumper-config-name: "global"
  loader-config-name: "global"
  syncer-config-name: "global"
  black-white-list: "br01"       #白名单列表
  column-mapping-rules: ["cm001"]   #自增主键重计算规则
-
  source-id: "mysql3307"
  route-rules: ["rt000","rt001"]
  filter-rules: ["ymdd-filter-rule"]
  mydumper-config-name: "global"
  loader-config-name: "global"
  syncer-config-name: "global"
  black-white-list: "br01"
  column-mapping-rules: ["cm002"]
-
  source-id: "mysql3308"
  route-rules: ["rt000","rt001"]
  filter-rules: ["ymdd-filter-rule"]
  mydumper-config-name: "global"
  loader-config-name: "global"
  syncer-config-name: "global"
  black-white-list: "br01"
  column-mapping-rules: ["cm003"]
filters:
  ymdd-filter-rule:
    schema-pattern: "shard_db *"
    #以下 2 行定义忽略的 binlog 事件
    events: ["truncate table","delete","drop table","drop database"]
    action: Ignore  

routes:
  rt000:
    #将上游所有 shard_db*匹配的库合并至 merge_db 库
    schema-pattern: "shard_db*"
    target-schema: "merge_db"
  rt001:
    #将上游所有 shard_tb*匹配的分表合并至 merge_db 库的 merge_tb 表中
    schema-pattern: "shard_db*"
    table-pattern: "shard_tb??"
    target-schema: "merge_db"
    target-table:  "merge_tb"
    
#由于上游数据库使用了自增主键，此处我们需要定义下游主键重算处理，该功能需要谨慎使用
#特别注意上游的自增主键不能有任何业务关系
column-mappings:
  cm001:
    schema-pattern: "shard_db*"
    table-pattern: "shard_tb??"
    expression: "partition id"
    source-column: "id"
    target-column: "id"
    arguments: ["1","shard_db","shard_tb"]
  cm002:
    schema-pattern: "shard_db*"
    table-pattern: "shard_tb??"
    expression: "partition id"
    source-column: "id"
    target-column: "id"
    arguments: ["2","shard_db","shard_tb"]
  cm003:
    schema-pattern: "shard_db*"
    table-pattern: "shard_tb??"
    expression: "partition id"
    source-column: "id"
    target-column: "id"
    arguments: ["3","shard_db","shard_tb"]
#黑白名单定义
black-white-list:
  br01:
    do-dbs: ["~shard_db*"]  #需要同步的库
    #需要忽略同步的库
    ignore-dbs: ["mysql","performance_schema","information_schema"]
    #需要忽略同步的哪个库的哪张表
    ignore-tables:
    - db-name: "~shard_db*"
      tbl-name: "~txc_undo_log*"
#以下默认即可 
mydumpers:
  global:
    threads:
    chunk-filesize: 64
    skip-tz-utc: true
    extra-args: " --no-locks "
loaders:
  global:
    pool-size: 64
    dir: "./dumped_data"
syncers:
  global:
    worker-count: 6
    batch: 1000
```
**启动迁移同步任务**
```
[tidb@dmmaster dmctl]$ dmctl -master-addr 192.168.128.132:8261
» start-task shard_to_tidb.yaml
» query-status
{
    "result": true,
    "msg": "",
    "tasks": [
        {
            "taskName": "shard_to_tidb",
            "taskStatus": "Running",
            "workers": [
                "192.168.128.133:53306",
                "192.168.128.133:53307",
                "192.168.128.133:53308"
            ]
        }
    ]
}
#任务运行正常
```
**上游数据全量导入 TiDB 完成后，我们登录 dm-worker 机器，删除全备并保留表结构文件**
**（节约磁盘空间成本），操作如下**

**先看一下备份目录的文件**

```
[root@dmworker dumped_data.shard_to_tidb]# ll |awk '{print $NF}'
metadata
shard_db01-schema-create.sql
shard_db01.shard_tb01-schema.sql
shard_db01.shard_tb01.sql
shard_db02-schema-create.sql
shard_db02.shard_tb02-schema.sql
shard_db02.shard_tb02.sql
```
**删除备份的数据，必须保留表库结构信息否则会出错**
```
[root@dmworker dumped_data.shard_to_tidb]# ls | grep -v schema | xargs rm -f
[root@dmworker dumped_data.shard_to_tidb]# ls
shard_db01.shard_tb01-schema.sql    shard_db02.shard_tb02-schema.sql 
shard_db02-schema-create.sql
```
**查看上游分库分表数据已迁移到下游 merge_db 库 merge_tb 表**

![图片](/res/session4/chapter5/from-sharding-to-tidb/from-sharding-tidb-1.png)


## 5.1.2.2 DM 常用管理命令
### 1. dm-worker 部署管理
**部署命令 deploy.yml**

```
#部署所有inventory.ini中所有选项中的主机服务
[tidb@dmmaster dm-ansible]$ ansible-playbook deploy.yml
#使用-l 参数部署指定标签，如部署 mysql3306 标签的 dm-worker 主机服务
[tidb@dmmaster dm-ansible]$ ansible-playbook deploy.yml -l mysql3306
#使得 --tags 部署指定部署 deploy.yml 中的某个标签任务，如仅部署所有的 dm-worker
[tidb@dmmaster dm-ansible]$ ansible-playbook deploy.yml --tags=dm-worker
```

**dm-worker 启动停止更新命令**

```
#启动 dm 集群，开始自动拉取上游 MySQL 的 binlog 日志
#相当于开启了 MySQL 的 Slave_IO_Running 线程
[tidb@dmmaster dm-ansible]$ ansible-playbook start.yml
#停止 dm 集群，停止拉取上游 MySQL 的 binlog日志
[tidb@dmmaster dm-ansible]$ ansible-playbook stop.yml
#滚动更新 dm 集群
[tidb@dmmaster dm-ansible]$ ansible-playbook rolling_update.yml
*此三个yml命令也可以配合-l、--tags一起使用。
```
### 2. dm-worker task 管理
**管理 task 需要使用 dmctl 连接上中控机，输入 help 查看所有命令信息**

```
#连接中控
[tidb@dmmaster dm-ansible]$ dmctl -master-addr 192.168.128.132:8261
»help
```
**start-task 命令读取 task 文件启动同步任务，相当于开启 MySQL 的 Slave_SQL_Running 线程**

```
[tidb@dmmaster dm-ansible]$ dmctl -master-addr 192.168.128.132:8261
#启动 task.yaml 配置文件中的所有 dm-worker 数据写入下游库任务
»start-task shard_to_tidb.yaml
#启动 shard_to_tidb.yaml 配置文件中的某个 dm-worker 数据写入下游库任务
#启动 shard_to_tidb.yaml 对应的子任务 192.168.128.133:53307，如下:
»start-task -w '192.168.128.133:53307' shard_to_tidb.yaml 
```

**stop-task 命令终止同步任务，相当于停止 MySQL 的 Slave_SQL_Running 线程**

```
[tidb@dmmaster dm-ansible]$ dmctl -master-addr 192.168.128.132:8261
#停止 shard_to_tidb.yaml 配置文件中的所有 dm-worker 数据写入下游库任务
#也可使用-w 参数停止某个指定的任务[可选 -w IP:PORT]
»start-task shard_to_tidb
```
**query-status 命令查看任务状态，默认显示所有任务状态，可指定任务名查看**

```
[tidb@dmmaster dm-ansible]$ dmctl -master-addr 192.168.128.132:8261
#查看 shard_to_tidb 任务当前状态
»query-status shard_to_tidb
```
**query-error 命令查看任务错误信息，默认显示所有任务的错误信息，可指定任务名查看**

```
[tidb@dmmaster dm-ansible]$ dmctl -master-addr 192.168.128.132:8261
#查看 shard_to_tidb 任务当前状态
»query-error shard_to_tidb
```
**skip_sql 跳过正在执行的 SQL 语句**

```
#查看出错的 binlog 位置(failedBinlogPosition)，确定是否可以路过错误
query-error shard_to_tidb
#跳过当前错误的 binlog
sql-skip --worker=192.168.128.133:53307 --binlog-pos=mysql-bin|000001.000003:737983  shard_to_tidb
#恢复继续任务
resume-task --worker=192.168.128.133:53307  shard_to_tidb
#再次查看错误信息
query-error shard_to_tidb
```
