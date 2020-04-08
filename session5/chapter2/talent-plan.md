## 2.3 Talent Plan: Made for Community, by Community

[Talent Plan](https://github.com/pingcap/talent-plan) 是由 PingCAP 发起的、面向社区人才培养的开源项目，该项目在 GitHub 上已拥有 **3800+** Star。Talent Plan 旨在开发并整合一系列开源协作、编程语言、基础设施等课程资料并与 TiDB 生态系统实践经验相结合，帮助开源爱好者以及基础设施爱好者逐步获得基础知识沉淀和技能提升。

自 2018 年 12 月份 Talent Plan 项目启动至今（北京时间 2020 年 3 月 7 日），线上课程共吸引国内外实名认证课程爱好者 **400** 余人，40 余人顺利通过线上课程的考核；线下实训项目成功举办 4 期，38 名同学顺利结业，15 名同学在通过 Talent Plan 课程考核后陆续加入 PingCAP，其他同学也持续在 TiDB Community 中发挥自己的光和热。

![Talent Plan Milestones](/res/session5/chapter2/talent-plan/talent-plan-milestones.png)

### 2.3.1 课程内容

Talent Plan 是为社区提供的学习资料，也在社区的建议和反馈中不断优化成长。在社区小伙伴的共同努力下，Talent Plan 正在进行新一轮的升级，这是一个涵盖了开源协作、Rust 语言、分布式数据库、分布式系统、TiDB/TiKV 原理精讲等线上学习课程以及 TiDB 开源社区项目线下实训课程的更大的学习版图。课程框架见下图：

![Talent Plan Framework](/res/session5/chapter2/talent-plan/talent-plan-framework.jpg)

#### 1. 线上课程

线上课程包括 4 个课程系列，分别是：[Open Source Collaboration 课程系列](#series-1-open-source-collaborationwip)、[Programming Language 课程系列](#series-2-programming-language)、[Infrastructure Systems 课程系列](#series-3-infrastructure-systems)、[Deep Dive into TiDB Ecosystem 课程系列](#series-4-deep-dive-into-tidb-ecosystem)。

每个课程系列中会有相关的课程供大家选择，课程之间是相互解耦的，大家可以结合自己需求自由规划学习路径。

##### Series 1: Open Source Collaboration(WIP)

这是专门为零基础开源爱好者准备的全新课程系列，我们希望通过这个系列课程的学习，即使是技术小白也能快速了解开源是什么、不同开源软件许可协议的差异、知名开源基金会（Linux、Apache、CNCF 等）的运作方式以及 TiDB 在开源方面的实践，快速掌握参与开源项目的小技巧。

这个课程系列目前仍在小范围测试阶段，如果你对于这个课程感兴趣，欢迎通过 [参与通道](#如何参与-talent-plan) 与我们取得联系。

##### Series 2: Programming Language

这个课程系列中将逐步对当下常用的编程语言学习课程进行整合，包括但不限于 Go、Rust、C++、Python 等。

需要特别介绍的是由 Rust 核心作者 Brian Anderson 精心设计的 Rust 学习课程—— [Practical Networked Applications in Rust](https://github.com/pingcap/talent-plan/tree/master/rust)，通过这部分课程的学习，你将能够独立创建一个基于 Rust 语言的 Key-Value 数据库。

#### Series 3: Infrastructure Systems

这个课程系列专为基础设施爱好者设计，其中包括：

* 用 Go 语言全新设计的分布式关系型数据库（[TinySQL](https://github.com/pingcap-incubator/tinysql)）课程（WIP）
* 用 Go 语言全新设计的分布式 Key-Value 数据库（[TinyKV](https://github.com/pingcap-incubator/tinykv)）课程（WIP）
* 用 Rust 语言打造的分布式系统（[Distributed Systems in Rust](https://github.com/pingcap/talent-plan/tree/master/dss)）课程

TinySQL 几乎涵盖了分布式数据库 SQL 层最重要的部分，课程介绍按照由简单到复杂，由静态到动态的顺序展开：

* 首先对 SQL 和关系代数做简要介绍，为后面的课程做准备。
* 然后关注于一个只读 SQL 的执行，从 Parser 开始解析语义，到执行器如何执行语义，再去了解优化器如何选出最优的执行计划；
* 最后关注于那些改变数据状态的 SQL（包括 DML 以及 DDL），以及如何处理它们和只读语句之间的相互影响。

TinyKV 类似已有的 [Distributed Systems in Rust](https://github.com/pingcap/talent-plan/tree/master/dss) 课程，它同样受著名的 MIT 6.824 所启发，但这次将更加接近 TiKV 的实现，引入调度相关逻辑，学员可以从 0 到 1 实现一个完整可用的分布式 KV 服务。课程主要分为四个部分：

* LAB1: 实现单机 KV server
* LAB2: 基于 Raft 实现多副本高可用 KV server
* LAB3: 实现 multi-Raft 以及数据均衡调度
* LAB4: 基于 percolator 模型实现分布式事务

通过 TinyKV 课程的学习，你将会从实践中对 Raft 协议，Percolator 分布式事务模型有一个更深刻的理解。同时，在实现 TinyKV 的过程中也有助于了解 TiDB + TiKV + PD 的实际框架，之后深入研究 TiDB/TiKV/PD 的源码会更加游刃有余。

目前，**全新设计的 TinySQL 和 TinyKV 课程已经基本实现了一个可用的课程框架和相关测试，接下来会进行进一步的优化调整，同时课程材料也在紧锣密鼓地进行编写中**。如果你对于这个课程感兴趣，欢迎通过 [参与通道](#如何参与-talent-plan) 与我们取得联系。

##### Series 4: Deep Dive into TiDB Ecosystem

这个课程系列将深入解读 TiDB 生态项目内部设计原理，TiDB、TiKV、Cloud TiDB 深度原理解析会逐步呈现在大家面前。

#### 2. 线下实训——Talent Challenge Program

线上课程成绩优秀的小伙伴将会被邀请参与线下实训项目，实训项目以小组方式进行，每个小组选择一个与 TiDB 生态系统相关的实训项目，在 1 个月左右的时间里通力协作完成项目并进行最终答辩，答辩通过的同学将获得专属 **PingCAP Talent Plan 结业证书**，线下实训期间表现优秀的还将有机会拿到 **PingCAP 校招/实习免面试绿色通道/Special Offer、 PingCAP/TiDB 全球 Meetup 的邀请函**等。

截止目前，线下实训已成功举办 4 期，累计线下学员数 41 人，累计覆盖 10 所高校，38 名同学顺利结业。

![Talent Plan Students](/res/session5/chapter2/talent-plan/talent-plan-students.png)

### 2.3.2 学习路径

#### 路径 1: Distributed Storage Engineer

如果你想要成为一名分布式存储工程师，可以选择以下课程组合：

* Programming Language: "[Practical Networked Applications in Rust](https://github.com/pingcap/talent-plan/tree/master/rust)"
* Infrastructure Systems: "[Distributed Key-Value Database Internals(WIP)](https://github.com/pingcap-incubator/tinykv)" &"[Distributed Systems in Rust](https://github.com/pingcap/talent-plan/tree/master/dss)"
* "Deep Dive into TiKV"

#### 路径 2: Distributed Relational Database Engineer

如果你想要成为一名分布式关系型数据库工程师，可以选择以下课程组合：

* Programming Language: "[A Tour of Go](https://tour.golang.org/welcome/1)"
* Infrastructure Systems: "[Distributed Relational Database Internals(WIP)](https://github.com/pingcap-incubator/tinysql)"
* "Deep Dive into TiDB"

#### 路径 3: Cloud TiDB Engineer

如果你想要成为一名云数据库工程师，可以选择以下课程组合：

* Programming Language: "[A Tour of Go](https://tour.golang.org/welcome/1)"
* Container & Container Orchestration (Docker、K8s …)
* “Deep Dive into Cloud TiDB(WIP)”

#### 路径 4: 开源社区运营

如果你对开源社区运营感兴趣，可以选择：

* Open Source Collaboration(WIP): “Introduction to Open Source Software” & “Build a Welcoming Community”
* 其他社区运营相关书籍，如：*[The Art of Community: Building The New Age Of Participation](https://drive.google.com/open?id=1EI6YcKlTdzojLD4RdVjYVlmFRTNzzge0)*, *[The Cathedral & the Bazaar: Musings on Linux and Open Source by an Accidental Revolutionary](https://www.goodreads.com/book/show/134825.The_Cathedral_the_Bazaar)*, *[People Powered: How communities can supercharge your business, brand, and teams](https://www.jonobacon.com/books/peoplepowered/)*

除了以上学习路径，你也可以结合自己的需求，将上述课程自由组合，挖掘新的学习路径。

### 2.3.3 学员们说

> * “我超级喜欢 PingCAP 的氛围还有培训的方式。这次培训从语言和数据库理论学习到跟进最新论文，再到动手实操小 Demo，了解 TiDB 各个部分实现原理以及最后阅读分析 TiDB 各个模块的代码，丰富的课程让我对数据库的理解又加深了一层。希望自己以后的研究东西能够贴近到具体的场景和系统去发现问题，并把自己的研究成果落地。我也非常期待 PingCAP Global Meetup 之旅和各路大牛交流。其实，现在内心还没平复下来，这次来北京收获太多了，现在话都组织不好了。” ——兰海（第一期优秀学员）
> * “参加 Talent Plan 是一次非常珍贵的体验，一方面是学到了许多的没有接触过的分布式领域的知识，另一方面也结识了来自全国各个高校的优秀的小伙伴以及 PingCAP 的各位厉害的导师，也为我之后来 PingCAP 实习埋下了伏笔。”（节选自[这门分布式 KV 存储系统课程教会了我什么？ | 我与 Talent Plan](https://zhuanlan.zhihu.com/p/78493213)）——张艺文（第二期优秀学员）
> * “参加这次 Talent Plan，我不仅学习到了丰富的知识，还深入地参与到具有挑战性的工程项目。更重要的是交到了一群非常优秀、靠谱的朋友。非常感谢 PingCAP 举办这个活动，希望 Talent Plan 越办越好。”——黄文俊（第三期优秀学员）
> * “经过 Talent Plan 的学习让我明白了，在实验室里 fancy 的想法在工业界可能并不 work，实际应用环境要比实验环境严格苛刻很多很多。经过这次线下课程的学习，我以后在设计方案的时候会着重考虑从现实的角度出发。”——邹欢（第三期最具潜力奖获得者）
> * “这次参加 Talent Plan 收获十分巨大，首先是认识了一群很棒的小伙伴，正如崔秋老师说的，一个月时间很短，但是友谊却是一辈子的。然后，我对整个 TiDB 生态以及其中的各个模块有了更高层次的认识和理解，也切身体验到了 PingCAP 很 Cool 的 Geek 氛围，总之度过了很有意义的一个月。”——林宁（第三期最具潜力奖获得者）
> * "工作后参加 Talent Plan 是非常神奇的体验。在这不仅能学习到 TiDB 各个模块的基础理论，还能听到一线的开发直接分享在生产环境中实践的一些细节和经验。最后还能和大家一起齐心协力去落地一个项目，并见证它成为这个优秀开源数据库的一部分。感觉自己回到了久违的学生时光，再一次体验快速成长，并重新找到当初选择这个行业的初心"——郑向升（第四期学员代表）

### 2.3.4 如何参与 Talent Plan

Talent Plan 规划了一个巨大的学习版图，我们期待着能与社区小伙伴一起逐步实现、不断优化，真正做到“Made for Community, by Community”。

* 如果你已经迫不及待想要开始 Talent Plan 课程的学习，[Talent Plan 官方网站](https://university.pingcap.com/talent-plan/) 中有已经规划好的 TiDB 及 TiKV 两条路径供你学习。
* 如果你想要为 Talent Plan 升级版课程贡献自己的一份力量，我们在 [TiDB Community Slack Workspace](https://join.slack.com/t/tidbcommunity/shared_invite/enQtNzc0MzI4ODExMDc4LWYwYmIzMjZkYzJiNDUxMmZlN2FiMGJkZjAyMzQ5NGU0NGY0NzI3NTYwMjAyNGQ1N2I2ZjAxNzc1OGUwYWM0NzE) 中开通了channel: **#wg-talent-plan-courses**，欢迎感兴趣的小伙伴们加入进来，一起打造更加“酷炫”的 2.0 版本！
