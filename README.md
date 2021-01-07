# Gitbook

Read it: [TiDB In Action: based on 4.0](https://book.tidb.io/)

Download PDF: [TiDB In Action: based on 4.0](https://raw.githubusercontent.com/pingcap-incubator/tidb-in-action/gh-pages/book.pdf)

## 如何阅读此书

本书由来自 TiDB Community 的贡献者共同完成。深入介绍了 TiDB 的基本原理和操作，它是基于 v4.0 版本编写的。如果需要了解 TiDB 最新版本的信息请关注 PingCAP [官方文档](https://docs.pingcap.com/zh/tidb/stable)

## 如何贡献
### 贡献指引：
* 从 [Project](https://github.com/pingcap-incubator/tidb-in-action/projects) 找到感兴趣的模块
* 在具体模块的 TODO 列表中选择一个感兴趣的任务。
* 阅读并更新内容
* 将内容提交 Pull Request

选题参考目录：[目录](SUMMARY.md) 

* 文章内容格式采用 [markdown](https://daringfireball.net/projects/markdown/syntax). 

* [Github 简易入门指南](Github-handbook.pdf)

## 图片目录

图片存放目录与文章存放一一对应，图片存放目录：`res/{doc-path}/`
- 其中 `{doc-path}` 为对应文章路径。

如例：
- 文章存放路径：`session1/chapter1/tidb-intro.md` 
- 对应图片存放目录为：`/res/session1/chapter1/tidb-intro/`
- 图片路径对应到 markdown 里为：`![1.png](/res/session1/chapter1/tidb-intro/1.png)`
 

## TiDB in Action 写作规则

 《TiDB in Action》是一本重视实操的书
 - 工具的介绍和使用部分会深入浅出，浅显易懂，这一部分可以当作工具书来查阅。
 - 原理与实现部分会相对言简意赅，意在帮助读者能够理解原理，从而更好地使用 TiDB。但无需陷入具体实现细节中，这部分读者浅尝辄止即可。

### 好的例子

#### 关于特性和产品介绍

* 介绍工具的简单原理
* 介绍工具如何使用（常见的参数，常见的应用场景）
* 给出一两个简单的例子

#### 关于最佳实践

* 力求用文字或图清晰按照时间轴描述整个过程
    * 事前准备
    * 事中操作流程
    * 事后效果检验
* 轻原理，重实操

### 不好的例子

* 贴原理实现的代码
* 直接复制粘贴案例，但是无操作流程
* 对工具只介绍，不给例子
* 选择的例子是个特例（不可复现）

### 写作规范

一千个作者一千个写作习惯，本书作者百家，文风也是百家争鸣，百花齐放，文笔各有千秋。
因此我们对文章内容只有一个标准 -- 清晰易懂

建议读者在阅读过程中，修正后的内容需要：
- 标题能够突出本章重点，言简意赅，忌：词不达意，
- 内容上下文衔接顺畅，逻辑通顺，忌：
  - 技术点错误
  - 内容描述不清晰的，语句不通
  - 内容缺失，缺乏过渡
  - 章节缺少开头、总结

此外，如果您有地方读不懂，想要修改又无从下手，请在内容附近使用 markdown 惯用的隐藏注释提问：

```
<!--TODO:这段看不懂/这里为什么是这样。。-->
```


## [License](LICENSE)

Shield: [![CC BY-SA 4.0][cc-by-sa-shield]][cc-by-sa]

This work is licensed under a [Creative Commons Attribution-ShareAlike 4.0
International License][cc-by-sa].

[![CC BY-SA 4.0][cc-by-sa-image]][cc-by-sa]

[cc-by-sa]: http://creativecommons.org/licenses/by-sa/4.0/
[cc-by-sa-image]: https://licensebuttons.net/l/by-sa/4.0/88x31.png
[cc-by-sa-shield]: https://img.shields.io/badge/License-CC%20BY--SA%204.0-lightgrey.svg
