# traptask.yaml reference

`traptask.yaml` is the task author's config. It lives in the task directory alongside `inputs/`, `expected/`, and any judge/grader scripts.

The entire file is optional. If absent, trap scans `inputs/` and treats each subdirectory as a case in output-only mode (no judge, no grader).

## Full example

```yaml
dirs:
  inputs: inputs/
  expected: expected/

cases:
  - id: case_one
    description: optional human-readable label
    tags: [smoke]
  - id: case_two
    skip: true
    tags: [wip]

judge:
  cmd: .venv/bin/python judge.py
  payload_envvar: TRAPTASK_PAYLOAD

grader:
  cmd: .venv/bin/python grader.py
  payload_envvar: TRAPTASK_PAYLOAD

setup_cmd: uv sync   # optional: prepare the checkout (e.g. install judge deps)
```

## Fields

### `dirs`

| Field | Default | Description |
|---|---|---|
| `inputs` | `inputs/` | Path to case input directories, relative to `traptask.yaml` |
| `expected` | `expected/` | Path to case expected output directories, relative to `traptask.yaml` |

### `cases`

List of case definitions. Each case must have a matching subdirectory under `dirs.inputs`.

| Field | Type | Description |
|---|---|---|
| `id` (required) | string | Case identifier; must match an `inputs/{id}/` directory |
| `description` | string | Optional label shown in the report |
| `tags` | list of strings | Used to filter cases with `tp run -t <tag>` |
| `skip` | bool | If `true`, the case is not executed (shown as skipped in the report) |

### `judge`

Optional. If absent, cases are run but not scored — `metrics` on each case result is empty.

| Field | Default | Description |
|---|---|---|
| `cmd` | — | Command to run the judge; parsed via `shlex.split`, cwd is the task directory |
| `payload_envvar` | `TRAPTASK_PAYLOAD` | Name of the env var injected with the per-case payload |

### `grader`

Optional. If absent, no final aggregation step runs.

| Field | Default | Description |
|---|---|---|
| `cmd` | — | Command to run the grader; parsed via `shlex.split`, cwd is the task directory |
| `payload_envvar` | `TRAPTASK_PAYLOAD` | Name of the env var injected with the full results payload |

### `setup_cmd`

Optional shell command that prepares the task checkout (e.g. `uv sync` to install the judge's dependencies). Run via the shell, cwd is the task directory.

Because it lives in `traptask.yaml`, the setup travels with the task version, so every solution author who points at the same task commit gets an identical environment — runs stay reproducible and comparable.

It **auto-runs** when a remote pull brings new code (a fresh clone or a branch fast-forward). For an already-current clone, a pinned-SHA clone, or a local task source it does not run automatically; force it with `tp run --setup-task`.
