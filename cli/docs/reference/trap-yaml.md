# trap.yaml reference

`trap.yaml` is the solution author's config. It lives next to the solution code and tells trap how to invoke the solution and which task(s) to run it against.

A trap.yaml *is* one solution's file: its invariant settings sit at the top level, and `tasks:` is the one nested collection of task bindings this solution is run against.

## Full example

```yaml
cmd: uv run python solution.py
stdin: input.json            # optional
manifest_envvar: TRAP_MANIFEST
metadata:
  model: gpt-4o
  framework: langchain
name: claude-sonnet-baseline   # optional leaderboard identity
cost:
  enabled: false             # omit to auto-detect from env

tasks:
  test:
    description: optional — shown in the report header
    traptask:
      source: ../task
    timeout: 30

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

### `cost`

Controls LLM cost tracking.

```yaml
cost:
  enabled: false    # omit to auto-detect from env vars; set false to disable
```

| Field | Default | Description |
|---|---|---|
| `enabled` | `true` (auto) | `false` disables the proxy entirely |

Omitting the `cost` key activates auto-detection: cost tracking starts when a supported API key env var is present (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`) or when Claude Code is available. See the [cost tracking guide](../guides/cost-tracking.md) for provider support details.

## `tasks` block

A mapping of task name → task binding. Each key is a name you can pass to `tp run <name>`; with one task, `tp run` uses it automatically.

### `traptask`

The task source (relative to `trap.yaml`). The whole block is optional and defaults to `../task`.

| Field | Default | Description |
|---|---|---|
| `source` | `../task` | Local path or git+ URL (polymorphic, like `--solution`). A git+ URL is cloned. |
| `clone_to` | hidden cache `.trap/repos/<repo>` | Clone target for a remote source. Only valid when `source` is a URL. |

### `description`

Optional label shown in the report header.

### `timeout`

Maximum seconds to wait for the solution subprocess. Default: `30`.
