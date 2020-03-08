TiSpark是 PingCAP为解决用户复杂 OLAP 需求而推出的产品。在借助Spark平台在计算及生态等方面优势的同时也融合了TiKV 分布式集群的优势，为大数据环境下的批量任务提供了一种解决方案。在本节将介绍如何在已有TiDB集群基础上引入TiSpark进行批量任务开发。本节假设你对Spark有基本认知。你可以参阅[ ](https://spark.apache.org/)[Apache Spark 官网](https://spark.apache.org/) 了解 Spark 相关信息。


---
#  TiSpark概述
TiSpark 是将 Spark SQL 直接运行在 TiDB 存储引擎 TiKV 上的 OLAP 解决方案。TiSpark 架构图如下：

![tispark.png](/res/session4/chapter6/batch-tasks-best-practices/tispark.png)

  

* TiSpark 深度整合了Spark Catalyst 引擎, 可以对计算提供精确的控制，使 Spark 能够高效的读取 TiKV 中的数据，提供索引支持以实现高速的点查；

  

* 通过多种计算下推减少Spark SQL 需要处理的数据大小，以加速查询；利用 TiDB 的内建的统计信息选择更优的查询计划。

  

* 从数据集群的角度看，TiSpark+TiDB 可以让用户无需进行脆弱和难以维护的 ETL，直接在同一个平台进行事务和分析两种工作，简化了系统架构和运维。

  

* 除此之外，用户借助TiSpark 项目可以在 TiDB 上使用Spark 生态圈提供的多种工具进行数据处理。例如使用 TiSpark 进行数据分析和 ETL；使用 TiKV 作为机器学习的数据源；借助调度系统产生定时报表等等。

---
# 环境准备
## TiSpark依赖包
当前，TiSpark 2.1.8是最新的稳定版本，官方强烈建议使用。它与Spark 2.3.0+和Spark 2.4.0+兼容。它还与TiDB-2.x和TiDB-3.x兼容。可以前往TiSpark在GitHub上的[首页](https://github.com/pingcap/tispark)查看更详细的版本兼容情况并下载。

## Spark
根据现有TiDB版本确定兼容的TiSpark依赖以后，便可以从Spark官网下载支持的版本，这里推荐[下载](https://archive.apache.org/dist/spark/)自带Hadoop环境的预编译版。

## JDK
TiSpark 需要 JDK 1.8+ 以及 Scala 2.11（Spark2.0+ 默认 Scala 版本）。


---
# TiSpark集群部署配置
TiSpark 可以在 YARN，Mesos，Standalone 等任意 Spark 模式下运行。这里使用 Saprk Standalone 方式部署。关于Saprk Standalone的具体配置方式请参考官方说明，下面给出的是与TiSpark相关的配置范例。

##  spark-env.sh配置
```
SPARK_EXECUTOR_MEMORY=10g
SPARK_EXECUTOR_CORES=5
SPARK_WORKER_MEMORY=40g
SPARK_WORKER_CORES=20
```
## spark-defaults.conf配置
```
spark.sql.extensions  org.apache.spark.sql.TiExtensions
spark.tispark.pd.addresses  127.0.0.1:2379
```
其中PD格式为地址:端口号，多个PD使用逗号间隔。
## 部署TiSpark
将TiSpark组件部署到Spark集群有两种方式，如果不想重启现有集群，可以使用 Spark 的 --jars 参数将 TiSpark 作为依赖引入:

spark-shell --jars $TISPARK_FOLDER/tispark-${name_with_version}.jar


如果想将 TiSpark 作为默认组件部署，只需要将 TiSpark 的 jar 包放进 Spark 集群每个节点的 jars 路径并重启 Spark 集群：

${SPARK_HOME}/jars

## 启动TiSpark集群
在选中的 Spark Master 节点执行如下命令：

```
cd ${SPARK_HOME}
./sbin/start-all.sh
```
命令执行以后，控制台会输出master和slave的启动信息并指出相应log文件。检查log文件确认集群各个节点是否启动成功。可以打开[http://spark-master-hostname:8080](http://spark-master-hostname:8080) 查看集群信息（Spark-Master默认的web端口号）。

---
# 使用范例
假设你已经按照上面的步骤成功部署并启动了TiSpark集群，下面分别介绍使用 Spark-Shell和 Spark-Submit两种方式来作OLAP 分析。

## Spark-Shell
如果你的TiSpark版本是2.0以上，那么在Spark-Shell中你可以直接调用Spark SQL与TiDB数据库交互：

```
spark.sql("use test")
spark.sql("select count(*) from user").show
```
TiSpark版本在2.0以前的需要在之前执行如下命令：

```
import org.apache.spark.sql.TiContext
val ti = new TiContext(spark, List("127.0.0.1:2379")
ti.tidbMapDatabase("test")
```
之后便可以像上面那样调用Spark SQL，不过建议尽量使用2.0以上版本的TiSpark。

## Spark-Submit
在实际开发中，Spark-Shell多用于测试，更多时候需要将代码打包后使用Spark-Submit命令提交到TiSpark集群。

如果你的工程是采用Maven构建的，需要在POM文件中引入Spark及TiSpark依赖，由于这些依赖在Spark集群上已经存在，需要将他们的依赖范围设置为Provided。

```
<dependencies>
    <dependency>
      <groupId>com.pingcap.tispark</groupId>
      <artifactId>tispark-core</artifactId>
      <version>2.1.8-spark_${spark.version}</version>
      <scope>provided<scope>
    </dependency>

    <dependency>
      <groupId>org.apache.spark</groupId>
      <artifactId>spark-core_2.11</artifactId>
      <version>${spark.version}</version>
      <scope>provided<scope>
    </dependency>
    <dependency>
      <groupId>org.apache.spark</groupId>
      <artifactId>spark-sql_2.11</artifactId>
      <version>${spark.version}</version>
      <scope>provided<scope>
    </dependency>
</dependencies>
```
配置好必要的依赖以后，便可以使用如下代码初始化一个SparkSession对象，Spark提供了面向多种语言的API，如Scala、Python、Java等，本节均以Java为例。

```
SparkSession sc = SparkSession
      .builder()
      .appName("TiSpark example")
      .master("local")
      .config("spark.sql.extensions", 
            "org.apache.spark.sql.TiExtensions")
      .config("spark.tispark.pd.addresses", "127.0.0.1:2379")
      .getOrCreate();
```
上面的代码支持你在本地调试你的TiSpark程序，如果你要打包到Spark集群运行，那么指定master和TiSpark的两个配置项都是不需要的。
接下来我们结合一个常见的场景展示一个批量任务案例：每天有一些交易文件需要落表，它包含交易双方和金额信息，之后需要基于该表进行分析。在这个案例中可以拆解出两个最基本的批量任务。

一个任务负责解析每天的文件并将数据写入目标表，目前TiSpark不支持直接将数据写入TiDB，但可以采用Spark原生JDBC方式写入，案例代码如下：

```
sc.read().schema(getStructType())
         .option("delimiter",true)
         .option("header",true)
         .csv(filePath)
         .withColumn("input_time", functions.current_timestamp())
         .repartition(100)         
         .write().mode(SaveMode.Append)
         .jdbc(url,tableName,connProperties);


public StructType getStructType(){
        List<StructField> fields=new ArrayList<>();
        
        StructField transferAccount = DataTypes.createStructField("transferAccount",DataTypes.StringType,false);
        StructField receiveAccount = DataTypes.createStructField("receiveAccount",DataTypes.StringType,false);

        StructField amount = DataTypes.createStructField("amount",DataTypes.createDecimalType(10,2),false);

        fields.add(transferAccount);
        fields.add(receiveAccount);
        fields.add(amount);
        return DataTypes.createStructType(fields);
}
```
在这段代码中为顺利解析文件而定义了被解析文件的格式和字段属性，随后为数据集添加了一个标志入库时间的列，最后将数据集以追加的方式写入到目标表。
关于写入TiDB，有以下几点需要注意：

1. 为了获得更好的写入效率并充分利用Spark集群资源，在写入之前最好使用repartition算子对数据进行再分区充分发挥Spark集群的计算能力，具体数值要根据任务数据量和集群资源来决定。
2. 要想让数据进行批量写入，TiDB连接串中需要跟上rewriteBatchedStatements参数并将其设置为True，然后通过JDBCOptions.JDBC_BATCH_INSERT_SIZE参数去控制批量写入的大小，官方推荐的大小为150。
3. 对于大量数据写入，推荐将事务隔离级别参数isolationLevel设置为NONE。

另一个任务从数据库读取数据进行分析，一段简单的分析代码如下：

```
sc.sqlContext().udf()
  .register("convert",newConvertUDF(),
            DataTypes.createDecimalType(10,2));
sc.sql("select transferAccount,receiveAccount,convert(amount) from tableName where receiveAccount='0001'");
```
上面的代码从表中筛选出账户号为0001的所有入账信息，其中convert是一个提供单位转换功能的自定义UDF函数，他在被注册到Job后可以直接在Spark SQL中使用。
Spark SQL支持各种自定义UDF或UDAF函数，合理利用这个特性可以使你的SQL更加强大。TiSpark支持常见的各种SQL语法，如连接和子查询，不过目前 TiSpark 暂时不支持 update 和 delete 的操作，后续会考虑支持这两个操作。

在开发完毕并将代码打包后，使用Spark-Submit命令将任务提交到Spark集群：

```
cd ${SPARK_HOME}
./bin/spark-submit \
--class Analyze \
--master spark://127.0.0.1:7077 \
/home/tispark/TiSparkExample.jar
```
关于Spark-Submit命令的更多参数，请参考Spark官网。

---
# 小结
本节介绍了如何在现有TiDB集群基础上部署和配置TiSpark集群，并通过一些简单案例展示了如何使用TiSpark组件进行批量任务开发。你应该发现了，使用TiSpark开发与原生Spark相比没有什么差别，如果你本就熟悉Spark的话会很快上手，这正如TiSpark官方所说的那样，TiSpark只是Spark之上的一个薄层。

 

如果你想使用TiSpark支撑批量任务的话，目前为止还是不够完善的，至少还有两个方面的问题需要解决。

首先在案例中是通过手动执行Spark-Submit命令提交任务的，这种方式只能用于调试不能用于生产，它也无法帮助你管理和监控批量任务，你需要引入类似oozie和Azkaban这样的批量工作流任务调度器，他们能帮助你管理批量任务并轻松做到定时运行或是组合多个任务这样的高级功能。如果有条件可以选择自主开发，毕竟适合自己的才是最好的。

另一个问题是，使用Spark API 进行开发虽然简单但也无法适应各种类型的批量任务，而Spark任务参数众多，有时需要根据每个任务的具体情况随时做出调整，这就使得你必须有某种参数解析机制来保证在批量任务运行时动态调整。所以你还需要在Spark API基础上设计一套适合你业务需求的批量任务代码规范，这样你就能保证批量任务的规范性和可靠性，同时也能减少冗余代码达到简化开发的目的。




# 






# 



 



