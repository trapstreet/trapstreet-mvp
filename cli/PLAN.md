# trap — 实施计划

## 待实现

- [ ] 统一源参数风格:`Task.traptask` 从 `TaskSource` 对象改回**多态字符串**(本地路径 | git+ URL),与 `--solution` 对齐（详见下「task 侧:traptask 改回多态字符串」）
- [ ] `tp skill` 命令：安装 Claude Code skill 到 `.claude/commands/trap.md`
  - 新增 `cli/src/trap/skills/trap.md`（skill 内容，随 wheel 打包；hatchling 自动包含，无需改 pyproject.toml）
  - `cli/src/trap/cli.py`：加 `from importlib.resources import files`，新增 `skill` 子命令
    - `--global`：安装到 `~/.claude/commands/trap.md`；默认装到 `./.claude/commands/trap.md`
    - `-f / --force`：覆写已有文件；否则报错退出
  - `cli/.claude/commands/trap.md`：symlink → `../../src/trap/skills/trap.md`（供贡献者在源码目录直接使用）
- [ ] `init` 命令：scaffold trap.yaml + traptask.yaml + inputs/ 目录（当前为 stub）
- [ ] runner 并发化：`TaskRunner._iter()` 改为 `asyncio.gather` 或 thread-pool，case 并行执行、judge 串行顺序不变
- [ ] `--fail-fast` 实测验证
- [ ] 测试套件（pytest）

---

## task 侧:traptask 改回多态字符串(与 `--solution` 对齐)

把 `Task.traptask` 从 `TaskSource` 对象({local, remote, init_cmd})改回**多态字符串**,和 solution 的 `--solution` 同一风格:

```yaml
traptask: ../task                                   # 本地路径
traptask: "git+https://github.com/acme/task@v1.0"   # 远程(可带 @rev)
traptask: "git+https://...#subdirectory=tasks/a"    # 远程 + subdir
```

- 字符串以 `git+` 开头 → 远程,clone 到**隐藏缓存** `.trap/repos/<repo>`(task 是依赖);否则当本地路径(相对 trap.yaml),省略默认 `../task`。
- 复用同一 `GitRepo`;已存在缓存照样校验 origin/rev(rev 钉在 URL 的 `@rev` 里)。
- **删除 `TaskSource` 模型**:`Task.traptask: str = "../task"`(多态、可选)。
- task **不提供 `--clone-to` 等价物**:依赖固定落缓存,不需选位置(这是和 solution 唯一的有意差别:task url→隐藏缓存、solution url→可见 `./<repo>`;本地默认 task=`../task`、solution=cwd)。

### 附带要定的:task 级 init_cmd 去留

`TaskSource` 现在带 `init_cmd`(clone 后 `subprocess.run(check=True)`)。改成单字符串后它**没有槽位**。两条路:

- **(推荐) 删掉**:和 solution 一致——交给 task 自己的 `judge`/`grader` cmd(`uv run` 会自动 sync task 的 pyproject/uv.lock,init_cmd 多余)。最简、对称。
- 保留:那 `traptask` 就不能是纯字符串,得回到对象(又引入嵌套),与本次目标矛盾。

倾向删掉。若将来某 task 确需非 uv 的 setup,再以 YAML 字段形式加回。

### ⚠️ 这是回退 + 破坏性变更

会**撤销本次刚做的 `TaskSource` 扁平化**,并比它更简(对象 → 字符串)。同步改:`models/config.py`(删 TaskSource、`traptask: str`)、`loader.from_task`、`models/__init__`、所有 examples 的 `traptask:`(改回 `traptask: ../task` 字符串)、CLAUDE.md。失去的能力仅"clone 远程到指定本地目录 + 复用校验"的组合(task 场景几乎不需要;真要再引入对象形式)。

---

## 待定（TBD）

- [ ] `tracing` 模块 — 记录每次 LLM 调用的 prompt/completion 内容、latency、cache hits、调用链；与 `cost` 共享同一 HTTP 代理机制，新增 collector 即可
- [ ] 多步 pipeline（steps 编排）
