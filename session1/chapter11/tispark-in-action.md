上一章节中，针对TiSpark的架构和原理进行了详细的介绍，在本章，我们会介绍TiSpark的部署和使用方法。

**TiSpark的部署**

TiSpark目前支持两种部署方式：

* 在现有Spark集群上部署TiSpark
* 部署一套新的TiSpark集群

。。。


**TiSpark的基本使用**

TiSpark的使用方法与原生Spark类似，提供多种方式查询数据。

* 通过Spark-Shell查询数据

使用spark-shell启动，通过spark提供的api即可访问数据。

示例一：利用spark-shell查询lineitem表的数据

```
scala>spark.sql("use tpch")
使用tpch库
scala>spark.sql("select count(*) from lineitem").show
查询lineitem表的总行数
查询结果显示如下：
+-------------+
| Count (1)   |
+-------------+
| 600000000   |
+-------------+
```
示例二：利用spark-sql查询复杂sql
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
* 通过Spark SQL查询数据

TiSpark同样支持利用SparkSQL查询数据。使用spark-sql命令即可进入交互式数据查询页面，接入输入sql即可。

示例三：利用spark-sql查询lineitem表的数据

```
spark-sql> use tpch;
使用tpch库
spark-sql> select count(*) from lineitem;
查询lineitem表的总行数
2000
Time taken: 0.673 seconds, Fetched 1 row(s)
```
* 利用JDBC访问TiSpark

部署时启动Thrift服务器后，可以通过JDBC的方式使用TiSpark。

示例四：利用beeline工具使用JDBC的方式访问TiSpark

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
**TiSpark的多语言使用**

* **使用PySpark访问TiSpark**

TiSpark on PySpark是TiSpark用来支持Python语言而构建的Python包。PySpark支持直接使用也可以通过python的包管理工具来安装使用。

示例一：直接使用PySpark访问TiSpark

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
示例二：利用pip安装pytispark后使用TiSpark

首先，利用pip来安装pytispark，相关命令如下：

```
pip install pytispark
```
安装完成之后，创建一个用以查询数据的python文件test.py，文件示例如下：
```
import pytispark.pytispark as pti
from pyspark.sql import SparkSession
spark = SparkSession.builder.getOrCreate()
ti = pti.TiContext(spark)
ti.tidbMapDatabase("tpch_test")
spark.sql("select count(*) from customer").show()
```
创建完成之后使用spark-submit来查询数据，相关命令如下：
```
./bin/spark-submit --jars /PATH/tispark-${name_with_version}.jar test.py
# Result:
+--------+
|count(1)|
+--------+
|     150|
+--------+
```
* **使用TiSparkR访问TiSpark**

TiSparkR是TiSpark用来支持R语言来构建的R包。同PySpark类似，TiSparkR同样支持直接使用也可以通过加载library的方式使用。

示例三：直接使用PySpark访问TiSpark

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
示例二：利用SparkR包的形式使用TiSpark
首先，创建一个用以查询数据的R文件test.R，文件示例如下：

```
library(SparkR)
sparkR.session()
sql("use tpch_test")
count <- sql("select count(*) from customer")
head(count)
```
创建完成之后使用spark-submit来查询数据，相关命令如下：
```
./bin/spark-submit  --jars /PATH/tispark-${name_with_version}.jar test.R
# Result:
+--------+
|count(1)|
+--------+
|     150|
+--------
```
**TiSpark访问TiFlash**

参见TiSpark访问TiFlash章节

