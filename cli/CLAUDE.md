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

**Solution side** — runner injects two env vars before each run (values are JSON strings, not file paths):
- `INPUTS` → JSON string mapping `filename → absolute path` for all files in `inputs/{case_id}/`
- `OUTPUTS` → JSON string mapping `filename → absolute path` for each declared `file_outputs` entry

Solution may also receive content piped to stdin (declared via `inputs.stdin` in trap.yaml).
stdout and stderr are always captured automatically.

**trap.yaml format** (`tasks:` wrapper; `traptask` is optional, defaults to `../task`):
```yaml
tasks:
  test:
    cmd: uv run python solution.py
    traptask:                    # task source; whole block optional, defaults to ../task
      source: ../task            # local path or git+ URL (polymorphic, like --solution)
      # source: git+https://github.com/org/repo@rev#subdirectory=X   # remote → cloned into clone_to
      # clone_to: .trap/repos/task   # optional clone target for a remote (default: hidden cache)
      # init_cmd: uv sync        # optional: run in the checkout after a clone / fast-forward
    inputs:
      stdin: input.txt           # optional: pipe this file as stdin
      files:                     # optional: validate these filenames exist before running
        - config.json
    file_outputs:                # files the solution writes via OUTPUTS env var
      - result.json
    timeout: 30                  # default 30s
    inputs_envvar: INPUTS           # override if solution already uses this name
    outputs_envvar: OUTPUTS

  run:                           # second task; same traptask, different cmd or inputs
    cmd: uv run python solution.py
    traptask:
      source: ../task
    inputs:
      stdin: input.txt
    file_outputs:
      - result.json
```

**Task side** — `traptask.yaml` is optional. If absent, trap auto-discovers cases by scanning `inputs/` subdirectories and runs in output-only mode (no judge/grader/expected). When present:
- `judge` and `grader` in traptask.yaml are optional; omitting either skips that step
- judge/grader receive `TRAPTASK_PAYLOAD` as a JSON string (not a file path) mapping `{inputs, outputs, expected}` namespaces (`filename → absolute path`)
- judge/grader write their result JSON to **stdout**; trap captures and stores it as `metrics`
- `payload_envvar` in traptask.yaml overrides the env var name (default `TRAPTASK_PAYLOAD`)

**Namespace key convention**: filenames including extension (`config.json`, `case_stdout`, `case_meta.json`).

**`.trap/` workspace**:
```
.trap/
└── {task}/
    ├── latest -> 2026-05-09T14:30:00/   # symlink to most recent run
    └── 2026-05-09T14:30:00/
        ├── {case_id}/                    # case outputs (case_stdout, case_stderr, case_meta.json, file_outputs)
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
tasks:
  test:
    cmd: uv run python solution.py
    traptask:
      source: ../task
    cost:
      enabled: false   # omit to auto-detect from env
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
