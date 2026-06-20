# Cost tracking

trap can measure token usage and LLM spend per case — without modifying your solution code.

---

## How it works

Before each case, trap starts a local HTTP reverse proxy for every active LLM provider. It redirects the provider's base URL env var (e.g. `ANTHROPIC_BASE_URL`) to point at this proxy. The proxy forwards every request to the real API, tees the response to extract token counts, then shuts down after the subprocess exits.

The solution sees no difference — it still talks to the same SDK with the same API key. The proxy is transparent.

---

## Auto-detection

Cost tracking activates automatically when an API key env var is present in the environment:

| Provider | Key env var |
|---|---|
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |

**Claude Code** (`claude -p`) is always intercepted regardless of env vars, because it authenticates via OAuth rather than an API key.

Cost tracking is skipped entirely if no key env var is set and no always-intercept provider is active.

---

## Supported providers

### Fully supported — zero solution changes required

These providers work out of the box. trap redirects the base URL env var and the SDK picks it up automatically.

| Provider | SDK package | Env var intercepted |
|---|---|---|
| Anthropic API | `anthropic` | `ANTHROPIC_BASE_URL` |
| OpenAI | `openai` | `OPENAI_BASE_URL` |
| Groq | `groq` | `GROQ_BASE_URL` |
| Claude Code (`claude -p`) | — | `ANTHROPIC_BASE_URL` |

**Example — Anthropic:**

```python
import anthropic
client = anthropic.Anthropic()   # reads ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL automatically
```

**Example — OpenAI:**

```python
from openai import OpenAI
client = OpenAI()                # reads OPENAI_API_KEY and OPENAI_BASE_URL automatically
```

### Supported with one-line solution change — Mistral

The Mistral Python SDK (`mistralai`) does **not** read the base URL from the `MISTRAL_BASE_URL` environment variable automatically. You must pass it explicitly via the `server_url` constructor parameter:

```python
import os
from mistralai.client import Mistral

client = Mistral(
    api_key=os.environ.get("MISTRAL_API_KEY"),
    server_url=os.environ.get("MISTRAL_BASE_URL"),   # required for proxy interception
)
```

When `MISTRAL_BASE_URL` is not set (normal production runs), `server_url=None` falls back to the SDK default (`https://api.mistral.ai`). The extra line has no effect outside of trap.

### Not supported

These providers cannot be intercepted via base URL redirection:

| Provider | Reason |
|---|---|
| AWS Bedrock | SDK uses AWS SigV4 signing and region-based endpoints; no redirectable base URL env var |
| Google Vertex AI | SDK uses Google OAuth and project-based endpoints; same limitation |

If you use these providers, cost data will simply be absent — trap will still run your solution and report correctness.

---

## Multi-provider and multi-model solutions

A single case can call multiple providers and multiple models simultaneously. trap tracks them separately.

```
cost.by_model:
  - provider: openai   model: gpt-4o-mini   prompt_tokens: 28  completion_tokens: 14  cost_usd: 0.000007
  - provider: openai   model: gpt-4o        prompt_tokens: 30  completion_tokens: 16  cost_usd: 0.000195
```

Aggregate totals (`prompt_tokens`, `completion_tokens`, `cost_usd`, `calls`) are summed across all models and available in `report.json` under `cost`.

The terminal table shows per-case aggregates. Per-model breakdown is in `report.json` (`cases[*].cost.by_model`).

---

## Cost data in report.json

```json
{
  "cases": [
    {
      "case_id": "capital_of_france",
      "cost": {
        "by_model": [
          {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "prompt_tokens": 28,
            "completion_tokens": 14,
            "cost_usd": 0.000007,
            "calls": 1
          }
        ],
        "prompt_tokens": 28,
        "completion_tokens": 14,
        "cost_usd": 0.000007,
        "calls": 1
      }
    }
  ]
}
```

`cost` is `null` if the solution made no LLM API calls (or if cost tracking is disabled).

---

## Disabling cost tracking

Add to `trap.yaml`:

```yaml
cmd: uv run python solution.py
cost:
  enabled: false

tasks:
  test:
    traptask:
      source: ../task
```

Omitting the `cost` key means auto-detect from env vars (the default).

---

## Cost pricing data

trap uses the [`tokencost`](https://github.com/AgentOps-AI/tokencost) library to convert token counts to USD. If a model is not in the library's pricing table, token counts are still tracked but `cost_usd` will be `0.0` (shown as `—` in the terminal table).

---

## Local and custom endpoints

If you point a provider at a local model server (e.g. Ollama, vLLM) via its base URL env var, trap will proxy through to that server. Token counts are extracted from the response as usual; cost will be `0.0` since local models have no pricing entry.

```bash
OPENAI_BASE_URL=http://localhost:11434/v1 tp run
```
