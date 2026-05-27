# trap — 实施计划

## 待实现

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

## 待定（TBD）

- [ ] `tracing` 模块 — 记录每次 LLM 调用的 prompt/completion 内容、latency、cache hits、调用链；与 `cost` 共享同一 HTTP 代理机制，新增 collector 即可
- [ ] 多步 pipeline（steps 编排）
