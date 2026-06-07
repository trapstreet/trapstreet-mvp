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

## git clone + init + run（task/solution 两侧）

### 背景

当前 `trap run` 只接受本地路径。新功能让 `traptask:` 字段和 `--solution` CLI 参数都支持 `git+` URL，实现一键 clone → init 环境 → 运行。

### URL 语法（pip/uv VCS 规范）

```
git+https://github.com/org/repo.git
git+https://github.com/org/repo.git@a1b2c3d
git+https://github.com/org/repo.git#subdirectory=packages/mypackage
git+https://github.com/org/repo.git@a1b2c3d#subdirectory=packages/mypackage
```

### 四种情形（按 `local` / `remote` 是否填写）

`traptask` 始终是 `TaskSource` 对象（不再接受裸字符串）。`local` 是主锚点、`remote` 可选：

| local | remote | 行为 |
|---|---|---|
| 写 | 不写 | 相对 trap.yaml 解析的本地目录，不 clone |
| 不写 | 不写 | 默认 `../task`（相对 trap.yaml），不 clone |
| 写 | 写 | clone remote → local；目录已存在则校验 origin==remote，再按 rev 处理（见下） |
| 不写 | 写 | clone → 默认 `<base_dir>/.trap/repos/<repo-basename>/`，再按 rev 处理 |

> 写了 `remote` 才会 clone 并校验；只有 `local`（或都不写）是纯本地目录。`init_cmd` 仅在发生 clone/fast-forward 时执行。

**目录已存在时的 rev 处理策略：**

| rev 类型 | 处理 | init_cmd |
|---|---|---|
| 无 rev | 仅校验 remote URL，不 fetch | 不执行 |
| SHA（`a1b2c3d`）| 直接比对 HEAD，不 fetch；不匹配报错 | 不执行 |
| tag（不可变）| fetch + 比对；不匹配报错 | 不执行 |
| branch（可变）| fetch + 比对；落后则 fast-forward pull；diverged 报错 | 有更新则执行 |

---

### 1. `src/trap/models/config.py`

`Task.traptask` 始终是 `TaskSource` 对象（**不再接受裸字符串**，无向后兼容包袱）。三个字段平铺(不再嵌套 `source:`)，`local` 为主锚点、`remote` 可选：

- `local` 写了 → 用它（相对 trap.yaml）；不写 → 默认 `../task`，或在有 `remote` 时落到 `.trap/repos/<repo>`
- `remote` 写了 → 从它 clone 进 `local`，且已存在的 clone 会校验 origin 是否匹配

```python
class TaskSource(BaseModel):
    local: Path | None = None    # 本地 task 目录；None → ../task，或有 remote 时落 .trap/repos/<repo>
    remote: str | None = None    # 可选 git+ URL；写了才 clone + 校验 origin
    init_cmd: str | None = None  # clone/fast-forward 后在 cwd 执行（如 "uv sync"）


class TrapConfig(BaseModel):
    tasks: dict[str, Task]


class Task(BaseModel):
    name: str = ""
    description: str = ""
    cmd: str
    traptask: TaskSource         # ← 原来是 str；现固定为平铺对象
    inputs: InputsBinding | None = None
    file_outputs: tuple[str, ...] = ()
    timeout: int = 30
    inputs_envvar: str = "INPUTS"
    outputs_envvar: str = "OUTPUTS"
    metadata: dict[str, Any] = {}
    solution: str | None = None
    cost: CostConfig | None = None
```

四种 local/remote 组合均合法（见上「四种情形」表），无需额外校验器。

> solution 侧的 init_cmd 暂不支持（原 `SolutionInit` 已作为死代码移除）。需要时再决定：放回 solution 自己的 trap.yaml（clone 后读，存在鸡生蛋时序），或做成 `--solution-init-cmd` CLI flag（clone 前已知，与 task 侧对称）。多数 solution 用 `uv run` 即可自动 sync,无需显式初始化。

---

### 2. `src/trap/git_ops/`（新建包）

依赖：`uv add gitpython`（已同步 `pyproject.toml`）。模块体量增长后拆成包，与 `cost/` `runner/` 等子系统惯例一致。

| 模块 | 内容 |
|---|---|
| `base.py` | `GitOpsError` 异常 + `ProgressCallback` 类型别名（`Callable[[str], None] \| None`，进度回调；`None` 关闭进度输出）|
| `url.py` | `ParsedGitUrl`（frozen dataclass）：`from_full_url()` 解析 `git+...@rev#subdirectory=X`，`basename` property |
| `rev.py` | `RevStrategy`(ABC) + `DefaultBranch` / `PinnedSha` / `NamedRef` 三个策略；`RevStrategy.for_rev(rev)` 工厂按 rev 字符串选策略 |
| `repo.py` | `GitRepo` 编排类（纯 git:clone/sync/路径解析）|
| `__init__.py` | re-export 公共 API：`GitOpsError` / `GitRepo`（外加 `RevStrategy` / 策略 / `ParsedGitUrl`）|

> init 命令的执行**不在 git_ops 里**——它只是"在某目录跑个 shell 命令",与 git 无关。loader 里直接 `subprocess.run(source.init_cmd, shell=True, cwd=repo.local_dir, check=True)`,失败抛 stdlib 的 `CalledProcessError`（不自造异常、也不复用 `GitOpsError`）。

**策略模式**（rev 处理）— 每种 rev 的完整生命周期（clone + reconcile）各自成类，避免逻辑被劈在 clone / sync 两条路径里：

- `DefaultBranch`（无 rev）— clone 默认分支；reconcile 永不更新
- `PinnedSha`（SHA）— clone 后 checkout；reconcile 离线比对 HEAD，不 fetch
- `NamedRef`（tag/branch）— clone `--branch`；reconcile fetch 后区分 tag（漂移报错）/ branch（fast-forward）

> tag vs branch 在 clone 前无法区分（同名可并存），只能 fetch 后看远端 refs 判定，故合在 `NamedRef`，不再细分两个类。具体语义见前文「目录已存在时的 rev 处理策略」表。

**`GitRepo`**（`repo.py`）把一个 git+ URL 绑定到本地克隆目录，拥有两个操作的**公共骨架**（状态提示、错误包装、remote 校验），rev 变化的内核委托给 strategy：

```python
class GitRepo:
    def __init__(self, url, path, base_dir) -> None:
        self.parsed = ParsedGitUrl.from_full_url(url)
        self.strategy = RevStrategy.for_rev(self.parsed.rev)
        self.path = path
        self.base_dir = base_dir

    @property
    def root(self) -> Path:        # 显式 path,或缺省落 .trap/repos/<repo>
        ...

    @property
    def local_dir(self) -> Path:   # root + subdirectory

    def ensure(self, progress: ProgressCallback = None) -> bool:
        # 只返回"变没变";路径从 self.local_dir 读
        return self._sync(progress) if self.root.exists() else self._clone(progress)

    def _clone(self, progress):  # 公共脚手架 → self.strategy.clone(...)
    def _sync(self, progress):   # 开仓库 + 校验 remote → self.strategy.reconcile(...)
```

调用方留住实例:`repo = GitRepo(url, path, base_dir)`,`repo.ensure(progress)` 跑 clone/sync 返回 `changed`,路径单独读 `repo.local_dir`;init 命令在 `changed and source.init_cmd` 时由 loader 直接 `subprocess.run(..., check=True)` 执行。不再提供 `resolve_repo` 门面（一行包装无封装收益，`GitRepo` 本身就是公开抽象）。`ensure` 只返回 `bool`,因为 `local_dir` 是构造期就确定的属性、与"是否变更"是两回事。

`GitRepo` 不碰 `init_cmd`——它纯粹负责 git 克隆/同步。错误文案与既有实现逐字一致。

---

### 3. `src/trap/loader.py`

**`TrapLoader.__init__`** — 改用 `TrapConfig` 解析整个 YAML：

```python
# 删除模块级 _tasks_adapter
from trap.models.config import TrapConfig

class TrapLoader:
    def __init__(self, trap_yaml_path: Path) -> None:
        self.trap_dir: Path = trap_yaml_path.resolve().parent
        data = yaml.safe_load(trap_yaml_path.read_text())
        config = TrapConfig.model_validate(data)
        self.tasks: dict[str, Task] = {
            name: task.model_copy(update={"name": name})
            for name, task in config.tasks.items()
        }
```

**`TrapTaskLoader.from_task`** — `traptask` 恒为 `TaskSource`，按 `remote` 是否存在分派：

```python
import subprocess
from trap.git_ops import GitOpsError, GitRepo  # noqa: F401 (re-raised)

@classmethod
def from_task(cls, task: Task, trap_dir: Path) -> TrapTaskLoader:
    source = task.traptask
    if source.remote is not None:
        explicit_path = str(source.local) if source.local is not None else None
        repo = GitRepo(source.remote, explicit_path, trap_dir)
        if repo.ensure() and source.init_cmd:
            subprocess.run(source.init_cmd, shell=True, cwd=repo.local_dir, check=True)
        traptask_dir = repo.local_dir
    else:
        traptask_dir = (trap_dir / (source.local or Path("../task"))).resolve()
    return cls(traptask_dir / "traptask.yaml")
```

`GitOpsError` / `subprocess.CalledProcessError` 直接上浮，由 CLI 层统一处理。

---

### 4. `src/trap/models/__init__.py`

```python
from .config import CostConfig, InputsBinding, Task, TaskSource, TrapConfig

__all__ = [
    ...,
    "TaskSource",
    "TrapConfig",
]
```

---

### 5. `src/trap/cli/__init__.py`

新增 import：

```python
import subprocess
from trap.git_ops import GitOpsError, GitRepo
```

`run` 命令新增两个参数（`--config/-c` 类型不变，`report`/`submit` 零改动）：

```python
@app.command()
def run(
    task: Annotated[str | None, typer.Argument()] = None,
    trap_yaml_path: Annotated[Path, typer.Option("--config", "-c")] = Path("trap.yaml"),
    solution: Annotated[str | None, typer.Option("--solution")] = None,
    solution_path: Annotated[Path | None, typer.Option("--solution-path")] = None,
    tags: Annotated[list[str] | None, typer.Option("--tag", "-t")] = None,
    output: Annotated[OutputFormat, typer.Option("--output", "-o")] = OutputFormat.rich,
    fail_fast: Annotated[bool, typer.Option("--fail-fast")] = False,
    workspace: Annotated[Path, typer.Option("--workspace", "-w")] = Path(".trap"),
) -> None:
    """Run a task against a solution."""
    # --- 1. clone solution repo (optional) ---
    sol_did_clone = False
    resolved_sol_dir: Path | None = None
    if solution is not None:
        try:
            sol_repo = GitRepo(
                solution,
                str(solution_path) if solution_path else None,
                Path.cwd(),
            )
            sol_did_clone = sol_repo.ensure(progress=lambda m: console.print(f"[dim]{m}[/dim]"))
            resolved_sol_dir = sol_repo.local_dir
        except GitOpsError as e:
            console.print(f"[red]error[/red]: {e}")
            raise typer.Exit(code=2) from None
        trap_yaml_path = resolved_sol_dir / "trap.yaml"

    # --- 2. load trap.yaml ---
    trap_yaml_loader = TrapLoader(trap_yaml_path)

    # solution 侧 init_cmd 暂不支持（SolutionInit 已移除）；如需要，clone 后在此执行。

    task_obj = trap_yaml_loader.resolve_task(task)

    # --- 3. load traptask (clones if git+ URL) ---
    try:
        task_yaml_loader = TrapTaskLoader.from_task(task_obj, trap_yaml_loader.trap_dir)
    except (GitOpsError, subprocess.CalledProcessError) as e:
        console.print(f"[red]error[/red]: {e}")
        raise typer.Exit(code=2) from None

    # remainder is unchanged from existing code ...
```

---

### YAML / CLI 例

`traptask` 恒为对象（`source` 子结构）。常见写法：

```yaml
# 本地默认：留空 → ../task
tasks:
  test:
    cmd: uv run python solution.py
    traptask: {}

# 本地显式路径
tasks:
  test:
    cmd: uv run python solution.py
    traptask:
      local: ../my-task

# git remote（local 省略 → .trap/repos/my-task/）
tasks:
  test:
    cmd: uv run python solution.py
    traptask:
      remote: "git+https://github.com/acme/my-task@v1.0"

# git remote + 指定 local + init_cmd
tasks:
  test:
    cmd: uv run python solution.py
    traptask:
      remote: "git+https://github.com/acme/mono#subdirectory=tasks/benchmark-a"
      local: ../my-task
      init_cmd: uv sync           # clone/fast-forward 后执行
```

```bash
# task side only uses git+ URL, solution is local
tp run

# solution via git+ URL
tp run --solution "git+https://github.com/acme/my-solution"
tp run --solution "git+https://github.com/acme/mono@v2.0#subdirectory=solutions/agent-a"
tp run --solution "git+https://github.com/acme/my-solution" --solution-path ./my-solution
```

---

### 验收测试

1. `traptask: {}` → 默认 `../task`，读取 `traptask.yaml`，run（裸字符串 `traptask: ../task` 现在应被 pydantic 拒绝）
2. `traptask: {remote: "git+https://...@v1.0"}` → clone 到 `.trap/repos/`，run
3. `traptask: {remote: "...", local: /tmp/t, init_cmd: "uv sync"}` → clone 到 `/tmp/t`，执行 `uv sync`，run
4. `/tmp/t` 已存在且 remote 不匹配 → `error: repo mismatch at /tmp/t`，exit 2
5. `--solution "git+https://..."` → clone + run（init_cmd 暂不支持）
6. branch rev + 目录已存在 → fetch，remote 有新 commit → fast-forward pull + 重跑 init_cmd
7. branch rev + 目录已存在 + remote 无变化 → 直接 run，不执行 init_cmd
8. tag/SHA rev + 目录已存在 + rev 不匹配 → 报错，不自动更新
7. `uv run ruff check src/trap` → 0 errors

---

## 待定（TBD）

- [ ] `tracing` 模块 — 记录每次 LLM 调用的 prompt/completion 内容、latency、cache hits、调用链；与 `cost` 共享同一 HTTP 代理机制，新增 collector 即可
- [ ] 多步 pipeline（steps 编排）
