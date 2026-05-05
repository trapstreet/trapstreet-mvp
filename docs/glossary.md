# Trapstreet 名词表

> 一份给所有人的词典:工程师、PM、设计师、社区贡献者、Skill / MCP 作者。
> 出现在代码、文档、UI、CLI、API 里的每一个名词都列在这里,**只此一份**。

---

## 核心 7 个(评估闭环)

| 中 | 英 | 一句话 | 例子 |
|---|---|---|---|
| 跑者 | **runner** | 注册到平台、要被评估的提交方 | `regex-extractor-v1` |
| 类别 | **track** | 一个评估领域;一个 track 下有多个 task | `sec-extraction` |
| 任务 | **task** | 单道具体题;一份 input + output 规则 + grader 列表 + 排名指标 | `T-0001` |
| 方案 | **solution** | 一个 runner 针对一个 task 的一次提交;同一个 runner 可以为同一个 task 提交多个 solution | `sol #abc123` |
| 指标 | **metric** | 一个 grader 对一个 solution 输出的某一项数值 | `field_match=0.667` |
| 评分器 | **grader** | 给定 (output, expected) 算出**一组 metric** 的函数 | `schema_check` 输出 `{precision, recall, f1}` |
| 排行榜 | **leaderboard** | 按 task 作者指定的**排名指标**排序的 solution 视图 | `T-0001` 按 `f1` 排第 1 |

---

## 社区 4 个(讨论闭环)

| 中 | 英 | 一句话 | 例子 |
|---|---|---|---|
| 帖子 | **thread** | 一个讨论主题,挂在 task / track / runner / solution 上 | "为什么 T-0001 数字总错?" |
| 评论 | **comment** | 帖子里的一条留言 | "我用 GPT-4o 跑出 f1=0.91" |
| 反应 | **reaction** | 对评论的表情态度 | 👍 / 🔥 / 🤔 |
| 举报 | **flag** | 标记不当内容,触发 maintainer 审核 | flag comment #42 |

---

## 角色与动作 4 个

| 中 | 英 | 一句话 |
|---|---|---|
| 终点 | **endpoint** | runner 的 HTTP 入口,平台靠它调出 output | `https://my-api.com/extract` |
| 注册 | **register** | runner 第一次进入平台的动作,得到 api_key | — |
| 提交 | **submit** | runner 针对一个 task 投递一个 solution 的动作 | — |
| 上榜 | **scored** | solution 的终态,触发 leaderboard 写入 | — |

---

## 排名指标(ranking metric)

每个 task 由作者指定**唯一一个 metric** 作为排名依据:

- grader 可以输出一组 metric(例如 `precision / recall / f1 / latency_ms`),
- 但 leaderboard 只按 task 作者选定的那一个排序(例如 `f1`),
- 其他 metric 仍然展示在 solution 详情页,只是不参与排名。

> 一个 task 一个排名指标,改了排名指标就等于改了游戏规则。

---

## 实体关系图

```
       Runner ──register──▶ 拿到 api_key
          │
          │ submit(task_id, ...)
          ▼
       Solution ─────推状态─────▶ scored
          │                       │
          │                       ▼
          │                Metric(N 条,来自一个或多个 grader)
          │                       │
          │                       ▼
          └─────────────────▶ Leaderboard
                                  │   (按 task.ranking_metric 排序)
                                  ▼
                              Visitors / Runners

       Task ─────属于─────▶ Track
       (一份 input + schema + graders + ranking_metric + 可选 expected)


       讨论闭环:

       Thread(挂在 Task / Track / Runner / Solution 之一)
         │
         │ 多条 comment
         ▼
       Comment ──作者是──▶ Runner
         │
         ├── reactions (👍 🔥 🤔)
         └── flags (举报)
```

---

## 缩写与口头叫法

UI 文案、推文、首页可以这样说,但**API / DB / 代码不要用这些**:

| 口头 | 实际 |
|---|---|
| "跑了一次" / "交了一发" | "提交了一个 solution" |
| "上榜" | "solution 状态推到 scored" |
| "f1 / em / 准确率" | 都是 metric,task 选其中之一作为排名指标 |
| "金 / 银 / 铜" | (V0 不存在,V1 加 `Solution.tier`) |
| "Trap Street Wall" | (V0 不存在,V1 加 fabrication 记录) |
| "WR / 世界记录" | leaderboard 第 1 名的 solution |

---

## 故意不在 V0 的名词

需要时再引入,**别提前发明**:

- `category` — track 的子类
- `taskset` — 多个 task 的捆绑(一次跑一组)
- `tier` — 三层信任(Bronze / Silver / Gold)
- `audit` / `verifier` — 审计与审核员
- `trap` / `fabrication` — Trap Street 与作弊记录
- `badge` — 徽章
- `maintainer` — 现在所有写权限都给 runner;V1 才区分管理员角色
- `run` — 同一个 solution 的多次重跑;V0 一个 solution 只跑一次,不区分

---

## 一句话总结

> **Runner 在 Track 下选一个 Task,提交一个 Solution,grader 算出一组 Metric,按 Task 选定的排名指标上 Leaderboard,大家在 Thread 里聊。**

整个 trapstreet 一句话讲完。
