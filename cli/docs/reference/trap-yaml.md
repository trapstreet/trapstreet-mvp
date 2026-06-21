# trap.yaml reference

`trap.yaml` is the solution author's config. It lives next to the solution code and tells trap how to invoke the solution and which task(s) to run it against.

A trap.yaml *is* one solution's file: its invariant settings sit at the top level, and `tasks:` is the one nested collection of task bindings this solution is run against.

## Full example

```yaml
cmd: uv run python solution.py
stdin: input.json            # optional
timeout: 600                 # optional — per-case hang ceiling (seconds)
manifest_envvar: TRAP_MANIFEST
metadata:
  model: gpt-4o
  framework: langchain
name: claude-sonnet-baseline   # optional leaderboard identity

tasks:
  test:
    description: optional — shown in the report header
    traptask:
      source: ../task

  run:
    traptask:
      source: ../task
```

## Solution fields (top level)

The program under test. These fields are invariant across the tasks this solution runs against, so they live at the top level rather than being repeated per task.

### `cmd` (required)

Shell command to invoke the solution. Parsed via `shlex.split` and run with the `trap.yaml` directory as `cwd`.

### `setup_cmd`

Optional shell command that prepares the solution checkout once (e.g. `uv sync`, `npm install`), run via the shell with the `trap.yaml` directory as `cwd`. Solution-author owned (it travels with the solution repo). trap auto-runs it when a remote pull brings new code (fresh clone or fast-forward); for an up-to-date/pinned clone or a local solution, force it with `tp run --setup-solution`. The symmetric counterpart of the task's `traptask.yaml` `setup_cmd` (forced independently by `--setup-task`).

### `stdin`

Optional filename. trap pipes `inputs/{case_id}/{filename}` into the solution's stdin. The solution also receives the run manifest (input/output directory paths) via the env var named by `manifest_envvar`; see the [IO contract](io-contract.md).

### `timeout`

Per-case wall-clock ceiling in seconds. Default: `600`. It is a **safety net against hangs/runaways** (an infinite loop, a deadlock, a blocked read), **not a fair time budget** — each case's real `duration` is recorded in the report, so speed is compared on actual duration, not gated here. Set it generously (a timed-out case counts as "did not complete"). Solution-author owned; applies to every task this solution runs.

### `manifest_envvar`

Name of the env var carrying the run manifest. Default: `TRAP_MANIFEST`. Override if the solution already uses this name for something else.

### `profile`

Self-reported engine identity, written to the run report. **Strict** — only two fields:

- `model` — the model(s) the run used.
- `framework` — what drove the model (e.g. `claude-code`, `langchain`, `stdlib-python`).

Each accepts a scalar or a list (a run may use several), and is normalised to a list in the report:

```yaml
profile:
  model: claude-sonnet-4          # → ["claude-sonnet-4"]
  framework: [claude-code, mcp]   # → ["claude-code", "mcp"]
```

Self-reported today; auto-detection is planned.

### `extra`

Free-form dict for author notes. Tolerated but **never written to the report** — an escape hatch for arbitrary keys that should stay out of the strict `profile`.

### `name`

Optional string. When set, `tp submit` creates (or reuses) a named solution identity on the leaderboard under the authenticated user, instead of auto-assigning a serial name. Useful when one person runs multiple agents in parallel.

### cost tracking

LLM token/spend tracking is **not** a trap.yaml field — it's a run-time, observability-only toggle, so it lives on the CLI. It is on by default; disable it per run with `tp run --no-cost`. Which providers are tracked is auto-detected from env (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, or Claude Code). See the [cost tracking guide](../guides/cost-tracking.md).

## `tasks` block

A mapping of task name → task binding. Each key is a name you can pass to `tp run <name>`; with one task, `tp run` uses it automatically.

### `traptask`

The task source (relative to `trap.yaml`). The whole block is optional and defaults to `../task`.

| Field | Default | Description |
|---|---|---|
| `source` | `../task` | Local path or git+ URL (polymorphic, like `--solution`). A git+ URL is cloned. |
| `clone_to` | hidden cache `.trap/repos/<repo>` | Clone target for a remote source. Only valid when `source` is a URL. |
