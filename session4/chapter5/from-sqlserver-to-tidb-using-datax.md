DataX 是阿里巴巴集团内被广泛使用的离线数据同步工具/平台，支持包括 MySQL、SQL Server、Oracle、PostgreSQL、HDFS、Hive、HBase、OTS、ODPS 等各种异构数据源之间高效的数据同步功能。DataX 采用了框架 + 插件 的模式。目前已开源，代码托管在 GitHub。

DataX 数据同步效率较高，满足大多数场景下的异构数据库间的数据同步需求。同时其配置灵活，支持字段级别的配置，可以轻松应对因异构数据库迁移到 TiDB 而产生的一些改动。

方案设计如图所示

![](3phase.png)

第一阶段：切换支持 TiDB 的应用上线之前，把 SQL Server 数据库中的全量数据用 DataX 同步到 TiDB 库中。为避免对线上业务产生影响，可以选择备份库，或者在业务低峰期操作。

第二阶段：把全量同步改为增量同步，利用 UpdateTime 字段（或其它条件，根据实际业务灵活调整）作为同步 Where 条件，进行增量覆盖式同步。 t_sync_record 表中记录每张表上次增量任务的执行时间。

第三阶段：支持 TiDB 的应用上线以后，增量同步切换读写数据源改为逆向增量同步，将新数据近实时地写回 SQL Server 数据库。一旦上线之后出现需要回退的情况，可随时切回 SQL Server，待修复之后再次上线。

具体操作步骤：

第一步：部署 DataX

下载
```
wget http://datax-opensource.oss-cn-hangzhou.aliyuncs.com/datax.tar.gz
```
解压
```
tar -zxvf datax.tar.gz
```
自检
```
python {YOUR_DATAX_HOME}/bin/datax.py {YOUR_DATAX_HOME}/job/job.json
```
第二步：编写 DataX 数据同步 Job（Json格式）

（1）全量同步Job

vi full.json

```
{

    "job": {

        "setting": {

            "speed": {

                #数据分片，分片数据可同时进行同步

                "channel": 128 

            }

        },

        "content": [{

             #SQL Server配置

            "reader": {

                "name": "sqlserverreader",

                "parameter": {

                    #数据库用户名

                    "username": "${srcUserName}",

                    #数据库密码

                    "password": "${srcPassword}",

                     #需要迁移的列名，* 表示全部列

                    "column": ["*"]

                    "connection": [{

                        #需要迁移的表名

                        "table": ["${tableName}"],

                         数据库 jdbc 连接

                        "jdbcUrl": ["${srcUrl}"]

                    }]

                }

        },

        #TiDB配置

        "writer": {

                "name": "tidbwriter",

                "parameter": {

                    #数据库用户名

                    "username": "${desUserName}",

                     #数据库密码

                    "password": "${desPassword}",

                     #使用 Replace 语法

                    "writeMode": "replace",

                    #目标表列名，* 表示全部列

                    "column": ["*"],

                    "connection": [{

                        #数据库 jdbc 连接

                        "jdbcUrl": "${desUrl}",

                        #目标表名

                        "table": ["${tableName}"]

                    }],

                     #本次迁移开始前执行的sql-作数据迁移日志使用

                    "preSql": [

                       "replace into t_sync_record(table_name,start_date,end_date) values('@table',now(),null)"],

                    #本次迁移完成后执行的 sql- 作数据迁移日志使用

                    "postSql": [

                       "update t_sync_record set end_date=now() where table_name='@table' " ]

                }

            }

        }]

    }

}
```

（2）增量同步 Job

vi increase.json

```
{

    "job": {

        "setting": {

            "speed": {

                #数据分片，分片数据可同时进行同步

                "channel": 128 

            }

        },

        "content": [{

             #SQL Server配置

            "reader": {

                "name": "sqlserverreader",

                "parameter": {

                    #数据库用户名

                    "username": "${srcUserName}",

                    #数据库密码

                    "password": "${srcPassword}",

                     #需要迁移的列名，* 表示全部列

                    "column": ["*"],

                    "connection": [{

                        #需要迁移的表名

                        "table": ["${tableName}"],

                         数据库 jdbc 连接

                        "jdbcUrl": ["${srcUrl}"]

                    }],

                    #抓取一个时间窗口的增量数据

                    "where": "updateTime >= '${syncTime}'"

                }

        },

        #TiDB配置

        "writer": {

                "name": "tidbwriter",

                "parameter": {

                    #数据库用户名

                    "username": "${desUserName}",

                     #数据库密码

                    "password": "${desPassword}",

                     #使用 Replace 语法

                    "writeMode": "replace",

                    #目标表列名，* 表示全部列

                    "column": ["*"],

                    "connection": [{

                        #数据库 jdbc 连接

                        "jdbcUrl": "${desUrl}",

                        #目标表名

                        "table": ["${tableName}"]

                    }],

                     #本次迁移开始前执行的sql-作数据迁移日志使用

                    "preSql": [

                       "replace into t_sync_record(table_name,start_date,end_date) values('@table',now(),null)"],

                    #本次迁移完成后执行的 sql- 作数据迁移日志使用

                    "postSql": [

                       "update t_sync_record set end_date=now() where table_name='@table' " ]

                }

            }

        }]

    }

}
```
（3）编写运行DataX Job的Shell执行脚本

vi datax_excute_job.sh


```
#!/bin/bash

source /etc/profile

srcUrl="Reader Sql Server 地址"

srcUserName="Sql Server 账号"

srcPassword="Sql Server 密码"

desUrl="Writer TiDB 地址"

desUserName="TiDB 账号"

desPassword="TiDB 密码"

# 同步开始时间

defaultsyncUpdateTime="2020-03-03 18:00:00.000"

# 同步周期(秒)

sleepTime="N"

tableName="Table1,Table2,..."

# 循环次数标识，-1为一直循环，其他按输入次数循环

flg=-1

while [ "$flg" -gt 0 -o "$flg" -eq -1 ]

do

        #更新时间设置为上次循序执行的时间

        if [ "" = "$preRunTime" ]; then

                syncTime=$defaultsyncUpdateTime

        else

                syncTime=$preRunTime

        fi

        #记录下本次循环执行时间，供下次循环使用

        preRunTime=$(date -d +"%Y-%m-%d %T")".000";

        echo $syncTime

        echo $preRunTime

        echo $flg

        python {YOUR_DATAX_HOME}/bin/datax.py -p "-DsyncTime='${syncTime}' -DtableName='${tableName}' -DsrcUrl='${srcUrl}' -DsrcUserName='${srcUserName}' -DsrcPassword='${srcPassword}' -DdesUrl='${desUrl}' -DdesUserName='${desUserName}' -DdesPassword='${desPassword}'" {YOUR_DATAX_HOME}/job/increase.json

        if [ -1  -lt  "$flg" ]; then

               let "flg-=1"

        fi

        sleep $sleepTime

done
```
（4）执行 Shell 脚本
```
chmod +x datax_excute_job.sh

nohup ./datax_excute_job.sh > info.file 2>&1 &
```
至此，核心脚本和操作都已完成，可通过修改参数配置，达到自己不同的需求，还可以配合数据对比服务，以期达到将应用程序从 SQL Server 顺利迁移到 TiDB 的目的。
