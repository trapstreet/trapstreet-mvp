① outputs_dir 把"solution 产物"和"trap 的运行记录"塞进了同一个目录(最可疑)
trap 跑完把 case_stdout/case_stderr/case_meta.json 写进同一个 case_outputs_dir。这埋了三件事:
- 命名碰撞:solution 要是真写了个叫 case_stdout 的文件,trap 在子进程结束后才写 capture,会静默覆盖它;judge 也分不清哪个是谁的。
- judge 看到的是混合体:solution 产物 + trap 元数据不分彼此,judge 只能靠"case_* 是 trap 的、其余是 solution 的"这条隐式约定去猜。
- stdout 被当成"输出目录里的一个文件"投递:echo/llm-qa 的 judge 就是 read(outputs_dir/"case_stdout") 拿 solution 的
stdout。也就是说执行通道(stdout/exit_code)和产物通道(写文件)被压进了同一个物理目录。这可能正是你隐约不安的点——outputs_dir 同时背了"solution
的产出"和"trap 对这次运行的记录"两个语义。

② judge manifest 的 inputs/expected 可能是冗余(见上表)。可以缩到只给 {case_id, outputs_dir},inputs/expected 让 judge 用 cwd 相对路径自取。代价:judge
要知道 dirs 布局——但那本就是它自己定义的。

③ 扁平文件假设(is_file() + 用 basename 当 key):子目录被丢、嵌套同名会撞 key。对 repo/文档树类输入直接失效(上轮提过)。

④ inputs 被独立扫两遍(Phase1 一遍、Phase2 一遍):假设"两次之间 inputs 目录不变"(成立),只是重复劳动,不算错。

⑤ grader 只拿 metrics、碰不到文件:假设"聚合只需逐例指标,永不需要跨例看产物"。多数情况成立,但把门关死了。
