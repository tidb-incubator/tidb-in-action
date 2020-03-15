## 2.4 Challenge Program

### 2.4.1 起源


TiDB 产品的每一次微小进步都离不开社区小伙伴的支持和帮助，在产品不断迭代的过程中，越来越多的小伙伴不断的参与到 TiDB 开源社区的建设当中，越来越多的小伙伴在 TiDB 开源社区用自己的方式表达着对于开源的热情和对于技术的追求，TiDB 也在社区小伙伴的推动下，不断地刷新着过去的成绩。

为了让 TiDB 产品在稳定性、性能、易用性等方面更上一层楼，PingCAP 推出一个中长期的挑战计划 —— TiDB Challenge Program。每一期的挑战赛都会在 TiDB 产品线的各个代码仓库中开放一些 Issue 出来供社区小伙伴探讨和解决。每一个 Issue 都会对应一定的积分，参赛选手可在每个赛季结束后用获得的积分兑换社区礼品。

目前为止，挑战赛已经进行了 2 期：

| season                                                      | period          |
| ----------------------------------------------------------- | --------------- |
| [Challenge Program season 2](https://github.com/pingcap/community/blob/master/challenge-programs/challenge-program-season-2.md) | 2020.03~2020.05 |
| [Challenge Program season 1](https://github.com/pingcap/community/blob/master/challenge-programs/challenge-program-season-1.md) | 2019.11~2020.02 |

### 2.4.2 第一季：性能


![Performance Challenge Program](/res/session5/chapter2/challenge-prigram/performanc-challenge-program.jpeg)

性能挑战赛的官网地址为：[TiDB Performance Challenge](https://pingcap.com/community-cn/tidb-performance-challenge/)。本次比赛奖项设置为：一等奖 1 名，二等奖 2 名，三等奖 3 名，其余分数高于 600 分的团队或个人为优秀奖，各团队和个人的获奖情况如下：
* 一等奖：.\* Team（15050 积分）。
* 二等奖：niedhui（4300 积分）和 catror（3500 积分）。
* 三等奖：pingyu（2600 积分）、Renkai（2550 积分）和 js00070（1800 积分）。
* 优秀奖：ekalinin（1450 积分）、mmyj（1050 积分）、AerysNan（750 积分）、MaiCw4J（650 积分）、Rustin-Liu（650 积分）和 koushiro（650 积分）。

在这次比赛中，选手们提升了 TiDB SQL 引擎的计算速度（优化了 in/like 表达式的执行性能），提升了 TiTan 的 GC 性能，极大的降低了 GC 对写入的影响，优化了 PD API 的性能，减少资源使用，降低对 PD 在线服务的影响。

更多精彩内容可查看 [性能挑战赛回顾](https://mp.weixin.qq.com/s/E4snu0C6J1feg5piC5ewqg)。

### 2.4.3 第二季：易用性


![Usaribility Challenge Program](/res/session5/chapter2/challenge-prigram/usaribility-challenge-program.svg)

作为 TiDB Challenge Program 系列的第二赛季，这一季将聚焦 TiDB 易用性。在书写本书的同事，第二季正在如火如荼的进行。第二季官网地址：[TiDB Usability Challenge](https://pingcap.com/community-cn/tidb-usability-challenge/)

在进行第一季的过程中，PingCAP 在 AskTUG 网站上发起了 “我的 TiDB 听我的” 的需求征集活动。需求收集从 2019.12.17 开始，2020.01.12 结束。经过历经 1 个月的需求收集，整理后对 20 个用户需求进行了投票活动。需求投票从从 2020 年 2 月 11 日开始，2020 年 2 月 20 日结束。每人只能投票一次，投票可多选，最少可投一个选项，最多可投 5 个选项。

经过前期 2 轮和需求有关的用户活动，挑战赛第二季从 2020 年 3 月 2 日正式开始，2020 年 05 月 30 日结束，持续 3 个月。本着「用户的需求就是我们的方向」，这一季的大部分需求都将由用户投票产生，这些需求将以任务的形式呈现在第二季挑战赛中，参赛选手可以通过认领任务的方式获得积分，在赛季结束后进行奖品兑换。

另外，比赛过程中，排名前三的需求，整体上各自分别加 10000， 8000， 6000 分。等需求完整的实现或者挑战赛结束，需求的加分将由需求的子任务完成者们一起分享。考虑到需求不一定能在挑战赛期间完整做完，这些需求额外积分的分享规则为：(该挑战者完成的该需求的子任务积分和/所有挑战者完成的该需求的子任务积分和)\*这个需求的总加分。

相比于上一季，第二季首次面向了海外，首次在 TiDB、TiKV、PD 以外的代码仓库开启了挑战赛活动，几乎覆盖了 TiDB 产品线上所有的开源代码仓库。

### 2.4.4 比赛规则

TiDB Challenge Program 全流程包括：查看任务->领取任务->实现任务->提交任务->评估任务->获得积分->积分兑换，其中“获得积分”之前的步骤都将在 GitHub 上实现。详细的比赛规则可查看 [这里](https://github.com/pingcap/community/blob/master/challenge-programs/challenge-program-season-2-cn.md)。

### 2.4.5 学习资料

PingCAP 提供了 [TiDB 精选技术讲解文章](https://github.com/pingcap/presentations/blob/master/hackathon-2019/reference-document-of-hackathon-2019.md)，帮助大家轻松掌握 TiDB 各核心组件的原理及功能。此外还有 [数据库小课堂](https://github.com/pingcap/awesome-database-learning)，帮助选手快速熟悉数据库知识，点击以上链接即可轻松获取。
