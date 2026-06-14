想让 Xiaotian 看懂两件事:**数据库变成什么样了**、**他要做什么**。我先核准两个关键事实——他名下任务的真实状态、还有他 CLI 现在上报的字段和我 v2.1 入库读的字段是否对齐(这是对他最有用的)——再组织成一份可以直接转发的简报。

一个对齐缺口确认了,值得专门告诉他。再看一眼 CLI 怎么组装 metadata 顶层字段,确保契约对照准确:

契约对照齐了。下面这份是按"给 Xiaotian 看"的口吻写的,你可以直接转发,或者我落成一个 issue @ 他(见末尾)。

---

## 给 Xiaotian:数据库改版 v2.1 + 你的任务

### 一、数据库长什么样了(只讲和 CLI 相关的)

整张库重构成 **8 张表**(详细设计:`docs/schema-v2-design-zh.md`)。和你 CLI 最相关的就两条心智:

- **solution = 一个 git commit,内容寻址,无主**。身份是 `(commit_sha, repo_path)`,不再是账号 + api_key。任何人 clone 同一个 commit 来跑,自动合并成同一个 solution。
- **唯一入库通道 = 单发 `POST /api/submit/:task_id`**。两步 `/api/runs`(先开 run 再传结果)**已经删除**。服务端现在的铁律是"runs 表里有行 = 已评分",这条**依赖你的 CLI 只用单发 submit** —— 你 a1171f1 正好就是这样,所以契约自洽,但**别哪天加回两步流**,会破坏这个不变量。

### 二、对你 CLI 的影响:几乎零强制改动

我核对过你 `provenance()` 上报的字段和我入库读的字段,**关键路径全对齐**:

| 你 CLI 报的 (metadata) | 服务端 v2.1 怎么用 | 状态 |
|---|---|---|
| `repo`(origin URL) | → `solutions.repo_url`(归一化) | ✅ 对齐 |
| `commit`(40-hex) | → `solutions.commit_sha`,入榜资格的内容锚 | ✅ 对齐 |
| 脏树/无 remote → 报 `{}` | → repo_url=NULL = **local 档,构造性永不上榜** | ✅ 这正是设计意图 |
| trap.yaml `engine`/`model` | → `solutions.model`(展示+筛选) | ✅ |
| `framework` | → `solutions.framework` | ✅ |
| 认证 Bearer token | 从 solution-api_key 改成**用户级 hash token**,但回跳参数名 `api_key=` 和响应 `{run, view_url}` **都没变** | ✅ CLI 无感 |

**结论:你现在的 CLI 不用动一行,继续能跑。** 脏树防护尤其优雅 —— 你脏树时 provenance 返回 `{}`,服务端就自动把它当 local 不入榜,不需要你额外报 `is_dirty`。

**一个真实缺口**(中优先,值得你知道):monorepo 子目录的 solution —— 你的 provenance 不报 `repo_path`/`subpath`,而 solution 身份是 `(commit_sha, repo_path)`。结果:**同一个 commit 下不同子目录的两个 solution 会撞成同一个**(都落 `repo_path=''`)。多数 solution 是独立 repo 时无所谓;真要支持 monorepo,你在 metadata 里加一个 `repo_path` 我就能区分(我已经在读 `repo_path`/`subpath`/`path` 三个别名了,你报哪个都行)。

**几个可选增强**(不报也能跑,报了数据更准/UI 更丰富):
- `cost_source`(proxy/claude_json/grader)—— 现在我默认填 `unknown`,你报了榜单成本就更可信
- `env` 诊断:`cli_version`/`os`/`is_pushed` —— 我都在读,只是你现在没报,报了 UI 能显示运行环境
- per-case `usage`(token 四档)—— 这是 #46 的正题,见下

### 三、你的任务(owner-xiaotian 标签,共 6 张)

已关:**#13 令牌安全**(随 v2.1 实装完成,明文 api_key 整列消失)。

进行中(按建议优先级):

| 票 | 一句话 | 性质 |
|---|---|---|
| [#34](https://github.com/trapstreet/trapstreet/issues/34) | `tp init` 脚手架 + examples 补全 trap.yaml | 新手上手,P1 |
| [#39](https://github.com/trapstreet/trapstreet/issues/39) | 提交前 opt-in 告知(简历类任务会传 PII)| **有法律风险**,面向真实用户前必做 |
| [#20](https://github.com/trapstreet/trapstreet/issues/20) | source=local 尝鲜路径(不写 GitHub 先上车)| 你的 provenance 已经天然支持,主要是 UX |
| [#38](https://github.com/trapstreet/trapstreet/issues/38) | 成本可伪造(改本地价表屠 cost 榜)| 缓解靠服务端重算,根治是 #23 |
| [#46](https://github.com/trapstreet/trapstreet/issues/46) | per-case 细节强约定(`agent_answer`/`expected`/`reason` 必填 + per-case usage)| 下个大版本,失败画廊的地基 |
| [#53](https://github.com/trapstreet/trapstreet/issues/53) | 多 provider(gitlab/google)—— 主要是 web,gitlab 那部分会牵到你的 repo 解析 | 远期 |

### 四、当前环境状态(重要)

- **schema v2.1 只上了 UAT(`uat.trapstreet.run`),生产还是旧库旧 schema** —— 你的 CLI 现在对着生产跑一切正常,不受影响。
- 等生产切 v2.1 时,我有迁移脚本兜底,你的 CLI 因为契约兼容**不需要配合改动**,只是切换那一刻起认证走新 token(用户重新 `tp auth login` 即可)。
- ⚠️ **两个仓库的 `cli/` 已经分叉**:你在 `AntiNoise-ai/trapstreet-mvp` 继续提交 CLI,而 web+schema 在 `trapstreet/trapstreet`,后者的 `cli/` 已落后你 5 个提交。**CLI 以哪个仓为准、怎么同步,需要你和 Zhuai 定个策略** —— 这是开会该顺手敲定的。

---

要不要我把这份**落成一个 GitHub issue**(标题类似"CLI ↔ schema v2.1 对接说明",@ Xiaotian,交叉链接他那 6 张票)?这样他在仓库里能直接看到、能顺着链接点进每张票。还是你直接转发给他就行。