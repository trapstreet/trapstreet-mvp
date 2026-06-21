# trap — Coding Agent Reference

## Project Overview

`trap` is a non-invasive CLI testing framework for AI workflows, agents, and prompt pipelines.
It treats the **solution** (the program under test) as a black box, calling it via subprocess and
evaluating its outputs (stdout and/or files). The framework knows nothing about how the solution is implemented.

Key constraint: solution repo and task repo are fully decoupled — they share only an IO contract.

Ownership:
- **task author** owns `traptask.yaml` and `task/judge.py` — defines what the solution must do and how to judge it
- **solution author** owns `trap.yaml` and `solution/` — configures how their solution runs (inputs, outputs, timeout) and points to the task directory

---

## IO Contract

**Solution side** — runner injects one env var before each run, `TRAP_MANIFEST`, a JSON
string (not a file path):
- `inputs_dir` → absolute path of the `inputs/{case_id}/` directory; the solution
  scans/reads it itself (so nested input trees are supported, not just flat files).
- `outputs_dir` → absolute path of the directory the solution writes into. The
  solution **owns this directory exclusively** — trap never writes here, so any file
  the solution drops (declared contract files and/or dynamically-named ones) is its
  own. On disk this is `{case_id}/solution/outputs/`.

Manifest values are **pure locations** — every value is a directory/file path (or
`null`); trap never inlines interpreted data. One mental model: "here are the
directories, read what you need." Directories (not pre-scanned `{name → path}`
dicts) keep the contract lossless for nested trees and let the consumer choose its
own representation; the consumer already knows the fixture filenames it authored.

Solution may also receive content piped to stdin (declared via the top-level `stdin`
field in trap.yaml — a single input filename). stdout/stderr/exit_code are always
captured automatically (see the `run` block below).

**trap.yaml format** — a trap.yaml *is* one solution's file: its invariant
settings (`cmd`, `setup_cmd`, `stdin`, `manifest_envvar`, `name`, `profile`, `extra`, `cost`) sit at
the top level, with `tasks:` as the one nested collection of task bindings it is
run against. Only per-task knobs (`traptask`, `description`, `timeout`) live under
each task entry:
```yaml
cmd: uv run python solution.py
setup_cmd: uv sync             # optional: prepare the checkout once after clone; force with --setup-solution
stdin: input.txt               # optional: pipe this input file to the solution's stdin
manifest_envvar: TRAP_MANIFEST   # override the env var name if the solution needs another
name: claude-sonnet-baseline   # optional leaderboard identity (else server auto-assigns)
profile:                       # optional self-reported engine identity → report.json
  model: claude-sonnet-4       # model/framework only; each takes a scalar or a list
  framework: stdlib-python
extra:                         # optional free-form author notes; never written to the report
  notes: anything
# cost: {enabled: false}       # optional; omit to auto-detect from env

tasks:                         # task bindings, keyed by name; `traptask` defaults to ../task
  test:
    traptask:                  # task source; whole block optional, defaults to ../task
      source: ../task          # local path or git+ URL (polymorphic, like --solution)
      # source: git+https://github.com/org/repo@rev#subdirectory=X   # remote → cloned into clone_to
      # clone_to: .trap/repos/task   # optional clone target for a remote (default: hidden cache)
    timeout: 30                # default 30s

  run:                         # second binding; same solution, different task source
    traptask:
      source: ../task
```

**Task side** — `traptask.yaml` is optional. If absent, trap auto-discovers cases by scanning `inputs/` subdirectories and runs in output-only mode (no judge/grader/expected). When present:
- `judge` and `grader` in traptask.yaml are optional; omitting either skips that step
- judge receives `TRAPTASK_MANIFEST` (JSON string, not a file path) with two tiers:
  - **filesystem directories** — `inputs_dir`, `expected_dir`, `outputs_dir` (all
    absolute directory paths; `expected_dir` is `null` when the case has no
    `expected/` dir). `outputs_dir` holds **only solution-written files** — trap's
    run captures are *not* mixed in, so a judge can `iterdir()` it to enumerate
    exactly what the solution produced (dynamic outputs supported).
  - **`run`** — the solution run's standard-stream captures, all as file paths:
    `{ "stdout": <path>, "stderr": <path>, "meta": <path> }`. `meta` points at a
    JSON file `{exit_code, duration}`; the judge reads it the same way it reads
    stdout. trap exposes locations, not values — it never inlines `exit_code`.
  - the judge needs no `case_id`: judging one case is a pure function of
    `(inputs_dir, expected_dir, outputs_dir, run)`, and trap tracks which case it is.
- grader receives `TRAPTASK_MANIFEST` as the JSON list of per-case results (not the namespaced manifest)
- `declared_outputs` in traptask.yaml is an **optional, advisory** declaration of
  what a solution produces — output filenames and/or the tokens `stdout`/`stderr`
  for the standard streams. A published contract for solution authors; trap never
  enforces it, the judge is the sole arbiter. Omit for dynamic outputs.
- judge/grader write their result JSON to **stdout**; trap captures and stores it as `metrics`
- `manifest_envvar` in traptask.yaml overrides the env var name (default `TRAPTASK_MANIFEST`)
- `setup_cmd` in traptask.yaml is an **optional** shell command that prepares the
  checkout (e.g. `uv sync`), run via the shell with cwd = the task dir. It is
  **task-author owned by design** — living with the task version means every
  solution that points at the same task commit gets an identical setup, so runs
  stay reproducible and comparable (a solution author cannot diverge it). trap
  auto-runs it when a remote pull brings new code (fresh clone or fast-forward);
  for an up-to-date/pinned clone or a local source, force it with `tp run --setup-task`
- The **solution** has a symmetric `setup_cmd` in trap.yaml (`TrapConfig.setup_cmd`,
  run by `TrapLoader.from_solution` with the same auto-on-pull rule, forced by
  `--setup-solution`). It is **solution-author owned** — each solution prepares its own
  checkout (deps, build) and only reproduces itself, so it doesn't affect
  cross-solution comparability (unlike the task one, which is fixed per task version).
  The two setups are independent: `--setup-solution` and `--setup-task` force each side
  separately.

**Filename convention**: `inputs_dir`, `expected_dir`, and `outputs_dir` are
directory paths; the consumer joins them with conventional filenames including
extension (`config.json`, `expected.json`). `run.stdout`/`run.stderr`/`run.meta`
are full file paths (read directly).

**`.trap/` workspace** — each actor (solution, judge, grader) owns a directory; its
run captures live there unprefixed (`stdout`/`stderr`/`meta.json`), keeping the
solution's `outputs/` clean:
```
.trap/
└── {task}/
    ├── latest -> 2026-05-09T14:30:00/   # symlink to most recent run
    └── 2026-05-09T14:30:00/
        ├── {case_id}/
        │   ├── solution/                 # solution actor
        │   │   ├── outputs/              # = outputs_dir; solution-written files only
        │   │   ├── stdout                # = run.stdout
        │   │   ├── stderr                # = run.stderr
        │   │   └── meta.json             # = run.meta  ({exit_code, duration})
        │   └── judge/                    # judge actor: stdout / stderr / meta.json
        ├── grader/                       # run-level grader: stdout / stderr / meta.json
        └── report.json                   # report for this run
```

---

## Architecture

```
loader  →  runner  →  judge  →  reporter
  ↑           ↑            ↑            ↑
YAML       subprocess   built-in     rich / JSON
parsing                or custom
```

Modules interact only through pydantic models (serialisable data). No shared state.
`runner` is intentionally stateless — inputs and outputs are plain data.

`TaskRunner._iter()` is kept as a separate generator (not inlined into `run()`) to preserve a clean
seam for future async or multi-threaded case execution — e.g. replacing the for-loop body with
`asyncio.gather` or a thread-pool map without restructuring `run()`.

---

## LLM Observability

Two distinct layers, both non-invasive (no changes to solution code):

### `cost` — token & spend tracking (implemented)

Intercepts the solution's LLM API calls via a local HTTP reverse proxy injected through env vars
(`ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, etc.). Parses token counts and computes cost per case.

**Mechanism**: `CostProxy` creates one `_ProxyServer` per active provider, each bound to a random
localhost port (port `0` → OS assigns). Env vars are redirected to point at these proxy ports before
the subprocess starts. The proxy forwards every request to the real API over HTTPS, tees the response
to extract `usage`, then shuts down after the subprocess exits. No TLS interception needed.

**Per-provider port design**: each provider gets its own port, so no per-request provider detection
is needed — `_ProxyHandler` always knows which provider it's serving from `self.server.provider`.

**Auto-detection**: activates when an API key env var is present (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, etc.), or unconditionally (`always_intercept=True`) for OAuth-based tools like
Claude Code that set no key env var but still honour `ANTHROPIC_BASE_URL`. Disable with
`cost: {enabled: false}` in trap.yaml.

**Provider support**:

| Provider | Status | Notes |
|---|---|---|
| Anthropic API | Full | SDK auto-reads `ANTHROPIC_BASE_URL` |
| OpenAI | Full | SDK auto-reads `OPENAI_BASE_URL` |
| Claude Code (`claude -p`) | Full | OAuth; `always_intercept=True` |
| Groq | Full | SDK auto-reads `GROQ_BASE_URL` |
| Mistral | Limited | SDK does **not** auto-read `MISTRAL_BASE_URL`; solution must pass `server_url=os.environ.get("MISTRAL_BASE_URL")` explicitly |
| AWS Bedrock | None | SDK-level auth (SigV4); no redirectable base URL |
| Google Vertex AI | None | SDK-level auth (Google OAuth); no redirectable base URL |

**Provider upstream URL rules** — SDKs differ in whether they include a path prefix when the base
URL is overridden. The proxy upstream in `_ProviderConfig` must compensate:
- Anthropic SDK: includes `/v1` in the path → upstream `https://api.anthropic.com` (no suffix)
- OpenAI SDK: drops `/v1` from the path when `base_url` is overridden → upstream `https://api.openai.com/v1`
- Mistral SDK: includes `/v1` in the path → upstream `https://api.mistral.ai` (no suffix)
- Groq SDK (openai-based): drops path prefix → upstream `https://api.groq.com/openai/v1`

**Multi-provider / multi-model design**: a single case can call multiple providers and multiple
models. The data model tracks them separately:
- `ModelCost` — per-(provider, model) bucket: `prompt_tokens`, `completion_tokens`, `cost_usd`,
  `calls`
- `CaseCost.by_model: list[ModelCost]` — all buckets for one case run
- `CaseCost.prompt_tokens / .completion_tokens / .cost_usd / .calls` — computed aggregates over
  all buckets
- `CaseResult.cost: CaseCost | None` — attached to each case result
- `Summary.cost_usd_total / .tokens_total` — aggregated across all cases in the run

**Cost pricing**: uses `tokencost` library (required dependency). If a model is absent from the
pricing table (e.g. Mistral models), token counts are tracked but `cost_usd` is `0.0`.

**Known limitation** — *Rich table*: the terminal table shows per-case aggregates only
(`prompt_tok`, `compl_tok`, `cost`). Per-model breakdown is available in `report.json`
(`cost.by_model`) but not rendered in the terminal output.

**trap.yaml**:
```yaml
cmd: uv run python solution.py
cost:
  enabled: false   # omit to auto-detect from env
tasks:
  test:
    traptask:
      source: ../task
```

### `tracing` — internal LLM call logs (planned)

Will record per-call details: prompt content, completion content, latency, cache hits, chain steps.
Shares the same proxy mechanism as `cost`. Not yet implemented.

**trap.yaml** (future):
```yaml
    tracing:
      enabled: true
```

---

## Rust Rewrite Constraints

These constraints keep future Rust migration cheap — do not violate them:

1. **Module boundaries**: loader / runner / judge / reporter communicate only via pydantic models.
   No shared mutable state between modules.
2. **Serialisable data only**: pass pydantic models (JSON-serialisable) across module boundaries.
   No Python-specific runtime objects.
3. **Stateless runner**: `runner` is a pure function — same inputs always produce same outputs.
4. **Stable JSON schema**: `--json` output schema is a public contract. Changes must be backwards-compatible.
5. **No dynamic Python features** in cross-module interfaces (no metaclasses, no dynamic attributes).

Modules most likely to be rewritten in Rust first: `runner`, `reporter`, CLI entry point.
`judge/custom` stays Python (calls user-written Python code).
