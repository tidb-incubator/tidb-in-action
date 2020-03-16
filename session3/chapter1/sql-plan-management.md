# 1.3 SQL Plan Management

## 1.3.1 背景

执行计划是影响 SQL 执行性能的一个非常关键的因素，SQL 执行计划的稳定性也对整个集群的效率有着非常大的影响。然而，当出现类似统计信息过时、添加或者删除了索引等情况时，优化器并不能确保一定生成一个很好的执行计划。此时执行计划可能发生预期外的改变，导致执行时间过长。因此 TiDB 提供了 SQL Plan Management 功能，用于为某些类型的 SQL 绑定执行计划，并且被绑定的执行计划会根据数据的变化而不断地演进。

## 1.3.2 SQL Bind

SQL Bind 是 SQL Plan Management 的第一步，在 TiDB 3.0 中 GA。使用它，用户可以为某一类型的 SQL 绑定执行计划。当出现执行计划不优时，可以使用 SQL Bind 在不更改业务的情况下快速地对执行计划进行修复。

创建绑定可以使用如下的 SQL：

```
CREATE [GLOBAL | SESSION] BINDING FOR SelectStmt USING SelectStmt;
```

该语句可以在 GLOBAL 或者 SESSION 作用域内为 SQL 绑定执行计划。在不指定作用域时，默认作用域为 SESSION。被绑定的 SQL 会被参数化，然后存储到系统表中。在处理 SQL 查询时，只要参数化后的 SQL 和系统表中某个被绑定的 SQL 匹配即可使用相应的优化器 Hint。

“参数化” 指的是把 SQL 中的常量用 "?" 替代，统一语句中的大小写，清理掉多余的空格、换行符等操作。

创建一个绑定的例子：

```sql
TiDB(root@127.0.0.1:test) > create binding for select * from t where a = 1 using select * from t use index(idx_a) where a = 1;
Query OK, 0 rows affected (0.00 sec)
```

查看刚才创建的 binding，下面输出结果中 `Original_sql` 即为参数化后的 SQL：

```sql
TiDB(root@127.0.0.1:test) > show bindings;
+-----------------------------+----------------------------------------------+------------+--------+-------------------------+-------------------------+---------+-----------------+
| Original_sql                | Bind_sql                                     | Default_db | Status | Create_time             | Update_time             | Charset | Collation       |
+-----------------------------+----------------------------------------------+------------+--------+-------------------------+-------------------------+---------+-----------------+
| select * from t where a = ? | select * from t use index(idx_a) where a = 1 | test       | using  | 2020-03-08 14:00:28.819 | 2020-03-08 14:00:28.819 | utf8    | utf8_general_ci |
+-----------------------------+----------------------------------------------+------------+--------+-------------------------+-------------------------+---------+-----------------+
1 row in set (0.00 sec)
```

如果要删除创建的 binding 可通过如下语句：

```sql
TiDB(root@127.0.0.1:test) > drop binding for select * from t where a = 1;
Query OK, 0 rows affected (0.00 sec)

TiDB(root@127.0.0.1:test) > show bindings;
Empty set (0.00 sec)
```

## 1.3.3 Baseline Evolution

为了解决只能手动创建 Binding 的问题，4.0 中 TiDB 提供了自动创建 Binding 功能，通过将 `tidb_capture_plan_baselines` 变量的值设置为 `on`，就可以自动为某一段时间内出现多次的 SQL 去创建绑定。TiDB 会为那些出现了至少两次的 SQL 创建绑定，统计 SQL 的出现次数依赖 TiDB 4.0 提供的 Statements Summary 功能。可通过如下方法打开自动为出现了两次以上的 SQL 创建绑定的开关：

```sql
set tidb_enable_stmt_summary = 1;       -- 开启 statement summary
set tidb_capture_plan_baselines = 1;    -- 开启自动绑定功能
```

接着连续跑两遍如下查询即可自动为其创建一条绑定：

```sql
TiDB(root@127.0.0.1:test) > select * from t;
Empty set (0.01 sec)

TiDB(root@127.0.0.1:test) > select * from t;
Empty set (0.00 sec)
```

再查看 global bindings 即可发现自动创建的 binding：

```sql
TiDB(root@127.0.0.1:test) > show global bindings;
+-----------------+---------------------------------------------------------+------------+--------+-------------------------+-------------------------+---------+-----------+
| Original_sql    | Bind_sql                                                | Default_db | Status | Create_time             | Update_time             | Charset | Collation |
+-----------------+---------------------------------------------------------+------------+--------+-------------------------+-------------------------+---------+-----------+
| select * from t | SELECT /*+ USE_INDEX(@`sel_1` `test`.`t` )*/ * FROM `t` | test       | using  | 2020-03-08 14:09:30.129 | 2020-03-08 14:09:30.129 |         |           |
+-----------------+---------------------------------------------------------+------------+--------+-------------------------+-------------------------+---------+-----------+
1 row in set (0.00 sec)
```

随着数据的变更，或者表结构定义的变化，可能原先绑定的执行计划已经不是最优的了，在 4.0 中可以通过 `set global tidb_evolve_plan_baselines = 1` 开启自动演进功能，来适应新的变化。对于自动演进来说，需要解决主要有两个问题：一个是演进哪些 SQL，一个是如何演进 SQL。

对于第一个问题，直观的想法是对于那些已绑定，且仍然是最有的执行计划，是不需要被演进的。也就是说，如果在不考虑所有绑定的情况下生成的代价最优执行计划，不在绑定的执行计划里面的话，TiDB 会考虑去演进这条 SQL 的执行计划，去看看这个新生成的执行计划究竟是不是最优的。在遇到这种情况后，TiDB 会将新生成的执行计划标记为待验证，并交由后台线程去验证执行计划，也就是上面所说的第二个问题。

对于第二个问题，关键点在于如何确定新生成的执行计划是比之前更好。最可靠的办法便是真实地执行一遍，并比较待验证的执行计划，和优化器在多个绑定中选出的最优执行计划的执行效率，只有当待验证的比被绑定的执行计划要好一定程度，才将其标记为可用。当然，实际执行带来的问题便是对系统集群的影响。为了减少自动演进对集群的影响，可以通过 `tidb_evolve_plan_task_max_time` 来限制每个执行计划运行的最长时间，其默认值为十分钟；通过 `tidb_evolve_plan_task_start_time` 和 `tidb_evolve_plan_task_end_time` 可以限制运行演进任务的时间窗口，默认的时间窗口为全天。
