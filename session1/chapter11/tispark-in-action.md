## 11.2 TiSpark 的使用
上一节中，针对 TiSpark 的架构和原理进行了详细的介绍，在本节，我们会介绍 TiSpark 的部署和使用方法。

### 11.2.1 TiSpark 的部署

由于 TiSpark 并没有直接修改 Apache Spark 的代码，因此只要是 Apache Spark 2.1 以上版本，就可以找到对应兼容的 TiSpark。具体版本的对应，可以查看官网文档[对应章节](https://github.com/pingcap/tispark#how-to-choose-tispark-version)。无论是通过 YARN 部署还是通过 Standalone 部署，都可以参考 Apache Spark 官网的[部署环节](https://spark.apache.org/docs/latest/cluster-overview.html)。通过匹配 Spark 版本，可以从 [TiSpark Release 栏目](https://github.com/pingcap/tispark/releases) 下载对应的 TiSpark 版本的 JAR 包。

实际开启和部署 TiSpark 需要确保如下两点：
1. Spark Driver 以及 Executor 可以访问到 TiSpark JAR 包。
2. Spark 开启如下参数（推荐通过修改 spark-defaults.conf 来控制）
```
spark.sql.extensions            org.apache.spark.sql.TiExtensions
spark.tispark.pd.addresses      pd-host1:port1,pd-host2:port2,pd-host3:port3
```

以 Standalone 集群为例，加入 TiSpark 流程如下：
1. 按照上述介绍修改 SPARK_HOME/spark-defaults.conf，加入上述必要配置。
2. 启动 Spark 应用时引用 TiSpark JAR 包。以 spark-shell 为例：
```
./spark-shell --jars /path/your-tispark.jar
```

### 11.2.2 TiSpark 的基本查询方式

TiSpark 的使用方法与原生 Spark 类似，提供多种方式查询数据。

#### 11.2.2.1 通过 spark-shell 查询数据

使用 spark-shell 启动，通过 Spark 提供的 API 即可访问数据。

示例一：利用 spark-shell 查询 lineitem 表的数据

```
scala>spark.sql("use tpch")
使用 tpch 库
scala>spark.sql("select count(*) from lineitem").show
查询 lineitem 表的总行数
查询结果显示如下：
+-------------+
| Count (1)   |
+-------------+
| 600000000   |
+-------------+
```
示例二：利用 Spark SQL 查询复杂 sql
```
scala> spark.sql(
      """select
        |   l_returnflag,
        |   l_linestatus,
        |   sum(l_quantity) as sum_qty,
        |   sum(l_extendedprice) as sum_base_price,
        |   sum(l_extendedprice * (1 - l_discount)) as sum_disc_price,
        |   sum(l_extendedprice * (1 - l_discount) * (1 + l_tax)) as sum_charge,
        |   avg(l_quantity) as avg_qty,
        |   avg(l_extendedprice) as avg_price,
        |   avg(l_discount) as avg_disc,
        |   count(*) as count_order
        |from
        |   lineitem
        |where
        |   l_shipdate <= date '1998-12-01' - interval '90' day
        |group by
        |   l_returnflag,
        |   l_linestatus
        |order by
        |   l_returnflag,
        |   l_linestatus
      """.stripMargin).show
scala> 
+------------+------------+---------+--------------+--------------+
|l_returnflag|l_linestatus|  sum_qty|sum_base_price|sum_disc_price|
+------------+------------+---------+--------------+--------------+
|           A|           F|380456.00|  532348211.65|505822441.4861|
|           N|           F|  8971.00|   12384801.37| 11798257.2080|
|           N|           O|742802.00| 1041502841.45|989737518.6346|
|           R|           F|381449.00|  534594445.35|507996454.4067|
+------------+------------+---------+--------------+--------------+
```
#### 11.2.2.2 通过 Spark SQL 查询数据

TiSpark同样支持利用 Spark SQL 查询数据。使用 spark-sql 命令即可进入交互式数据查询页面，接入输入 sql 即可。

示例三：利用 spark-sql 查询 lineitem 表的数据

```
spark-sql> use tpch;
使用 tpch 库
spark-sql> select count(*) from lineitem;
查询lineitem表的总行数
2000
Time taken: 0.673 seconds, Fetched 1 row(s)
```
#### 11.2.2.3 利用 JDBC 访问 TiSpark

部署时启动 Thrift 服务器后，可以通过 JDBC 的方式使用 TiSpark。

示例四：利用 beeline 工具使用 JDBC 的方式访问 TiSpark

```
beeline> !connect jdbc:hive2://localhost:10000
1: jdbc:hive2://localhost:10000> use testdb;
+---------+--+
| Result  |
+---------+--+
+---------+--+
No rows selected (0.013 seconds)
select count(*) from account;
+-----------+--+
| count(1)  |
+-----------+--+
| 1000000   |
+-----------+--+
1 row selected (1.97 seconds)
```
### 11.2.3 TiSpark 的多语言使用

#### 11.2.3.1 使用 PySpark 访问 TiSpark

TiSpark on PySpark 是 TiSpark 用来支持 Python 语言而构建的 Python 包。PySpark 支持直接使用也可以通过 python 的包管理工具来安装使用。

示例一：直接使用 PySpark 访问 TiSpark

```
./bin/pyspark --jars /PATH/tispark-${name_with_version}.jar
# Query as you are in spark-shell
spark.sql("show databases").show()
spark.sql("use tpch_test")
spark.sql("show tables").show()
spark.sql("select count(*) from customer").show()
# Result
+--------+
|count(1)|
+--------+
|     150|
+--------+
```
示例二：利用 pip 安装 pytispark 后使用 TiSpark

首先，利用 pip 来安装 pytispark，相关命令如下：

```
pip install pytispark
```
安装完成之后，创建一个用以查询数据的 python 文件 test.py，文件示例如下：
```
import pytispark.pytispark as pti
from pyspark.sql import SparkSession
spark = SparkSession.builder.getOrCreate()
ti = pti.TiContext(spark)
ti.tidbMapDatabase("tpch_test")
spark.sql("select count(*) from customer").show()
```
创建完成之后使用 spark-submit 来查询数据，相关命令如下：
```
./bin/spark-submit --jars /PATH/tispark-${name_with_version}.jar test.py
# Result:
+--------+
|count(1)|
+--------+
|     150|
+--------+
```
#### 11.2.3.2 使用 TiSparkR 访问 TiSpark

TiSparkR 是 TiSpark 用来支持R语言来构建的 R 包。同 PySpark 类似，TiSparkR 同样支持直接使用也可以通过加载 library 的方式使用。

示例三：直接使用 PySpark 访问 TiSpark

```
./bin/sparkR --jars /PATH/tispark-${name_with_version}.jar
sql("use tpch_test")
count <- sql("select count(*) from customer")
head(count)
# Result
+--------+
|count(1)|
+--------+
|     150|
+--------+
```
示例四：利用 SparkR 包的形式使用 TiSpark
首先，创建一个用以查询数据的 R 文件 test.R，文件示例如下：

```
library(SparkR)
sparkR.session()
sql("use tpch_test")
count <- sql("select count(*) from customer")
head(count)
```
创建完成之后使用 spark-submit 来查询数据，相关命令如下：
```
./bin/spark-submit  --jars /PATH/tispark-${name_with_version}.jar test.R
# Result:
+--------+
|count(1)|
+--------+
|     150|
+--------
```
#### 11.2.3.3 TiSpark 访问 TiFlash

参见 TiSpark 访问 TiFlash 章节

