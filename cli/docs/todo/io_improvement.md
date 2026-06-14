# IO 流向梳理 & 嗅到的"多余假设"

## 物理位置:三样东西分属两个仓库 + 一个 cwd 错位

| 资源 | 物理位置 | 属于谁 |
|---|---|---|
| inputs | `traptask_dir/inputs/{case_id}/` | task 仓库 |
| expected | `traptask_dir/expected/{case_id}/` | task 仓库 |
| outputs | `{workspace}/.trap/{task}/{ts}/{case_id}/`(workspace 相对 `tp` 的 cwd) | solution 侧 |

两个子进程的 cwd 是错开的:

- solution 子进程:`cwd = trap_dir`(solution 仓库)
- judge / grader 子进程:`cwd = traptask_dir`(task 仓库)

记住这个错位,后面"哪些 manifest 字段其实是多余的"全从这里推出来。

## 流程逐段(标出 env-var 跨越点)

**Phase 0 加载**

- `TrapLoader` 读 solution 的 trap.yaml → `task_obj`(cmd / inputs binding / timeout)
- `TrapTaskLoader` 读 task 的 traptask.yaml → `traptask`(cases / judge / grader / dirs / 那个 advisory `file_outputs`)

**Phase 1 跑 solution(CaseRunner)— env: `TRAP_MANIFEST`**

- inputs:`iterdir()` 扫 `case_inputs_dir`(只取 `is_file()`)→ `{name: abspath}`
- stdin:若声明,读 `case_inputs_dir/stdin` 管道喂进去
- outputs:`mkdir(case_outputs_dir)` → 路径塞进 `outputs_dir`
- expected:不给(P3)
- 跑完后 trap 把 stdout/stderr/meta 写进 `case_outputs_dir`:`case_stdout` / `case_stderr` / `case_meta.json`

**Phase 2 跑 judge(JudgeRunner,可选)— env: `TRAPTASK_MANIFEST`**

- inputs:再扫一遍 `case_inputs_dir` → 字典
- outputs_dir:`case_outputs_dir` 路径(judge 自己扫,看到的是 solution 产物 + trap 的三个 capture 文件混在一起)
- expected:扫 `case_expected_dir` → 字典
- judge 把结果 JSON 打到 stdout → trap 解析成 `metrics` 挂到 `CaseResult`

**Phase 3 跑 grader(可选)— env: `TRAPTASK_MANIFEST`**

- manifest = `CaseResult` 列表的 JSON(不是带命名空间的那个 manifest)→ grader 只看到每例的 exit_code/duration/metrics/cost,碰不到文件

**Phase 4 报告**:`report.json` 写进 run_dir;更新 `latest` 软链。

## 关键分析:"谁必须被告知" vs "谁本可以自己找到"

把 cwd 错位和物理位置叠起来,得到一张必要性表——这才是找多余假设的杠杆:

| 消费者(cwd) | inputs | expected | outputs_dir |
|---|---|---|---|
| solution(在 solution 仓库) | 必须(inputs 在 task 仓库,猜不到绝对路径) | — | 必须(trap 选的 `.trap` 路径,猜不到) |
| judge(在 task 仓库) | 本可自己定位(`inputs/{id}/` 就在它 cwd 下) | 本可自己定位(`expected/{id}/` 就在它 cwd 下) | 必须(在 solution 侧 `.trap`,judge 猜不到) |

→ 对 judge 而言,manifest 里真正不可或缺的只有 `outputs_dir`。inputs/expected 是 task 作者自己仓库里、自己摆放的文件,judge 的 cwd 就在那儿,完全可以相对路径自取。manifest 替它解析这两个,本质是"把 judge 跟它自己的目录布局解耦"——可这布局正是 judge 作者写的(traptask.yaml 的 dirs + 自己放的文件)。让作者跟自己的东西解耦,大概率是多余的假设。(唯一仍需 manifest 提供的,是"当前判的是哪个 case_id"——现在这个信息只能从路径里反推出来。)

## 嗅到的几个"多余假设"(按可疑程度排)

**① outputs_dir 把"solution 产物"和"trap 的运行记录"塞进了同一个目录(最可疑)**

trap 跑完把 `case_stdout`/`case_stderr`/`case_meta.json` 写进同一个 `case_outputs_dir`。这埋了三件事:

- 命名碰撞:solution 要是真写了个叫 `case_stdout` 的文件,trap 在子进程结束后才写 capture,会静默覆盖它;judge 也分不清哪个是谁的。
- judge 看到的是混合体:solution 产物 + trap 元数据不分彼此,judge 只能靠"`case_*` 是 trap 的、其余是 solution 的"这条隐式约定去猜。
- stdout 被当成"输出目录里的一个文件"投递:echo/llm-qa 的 judge 就是 `read(outputs_dir/"case_stdout")` 拿 solution 的 stdout。也就是说执行通道(stdout/exit_code)和产物通道(写文件)被压进了同一个物理目录。这可能正是你隐约不安的点——`outputs_dir` 同时背了"solution 的产出"和"trap 对这次运行的记录"两个语义。

**② judge manifest 的 inputs/expected 可能是冗余**(见上表)。可以缩到只给 `{case_id, outputs_dir}`,inputs/expected 让 judge 用 cwd 相对路径自取。代价:judge 要知道 dirs 布局——但那本就是它自己定义的。

**③ 扁平文件假设(`is_file()` + 用 basename 当 key)**:子目录被丢、嵌套同名会撞 key。对 repo/文档树类输入直接失效。

**④ inputs 被独立扫两遍**(Phase1 一遍、Phase2 一遍):假设"两次之间 inputs 目录不变"(成立),只是重复劳动,不算错。

**⑤ grader 只拿 metrics、碰不到文件**:假设"聚合只需逐例指标,永不需要跨例看产物"。多数情况成立,但把门关死了。
