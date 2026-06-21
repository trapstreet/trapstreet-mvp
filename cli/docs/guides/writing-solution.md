# Writing a solution

A solution is any program that can be invoked from a shell. It receives inputs via environment variables and stdin, and writes outputs to paths provided via environment variables.

---

## Minimal setup

Create `trap.yaml` next to your solution code:

```yaml
cmd: uv run python solution.py

tasks:
  test:
    traptask:
      source: ../task          # path to the directory containing traptask.yaml
```

Run from the same directory as `trap.yaml`:

```bash
tp run
```

---

## Reading inputs

Before each case, trap injects two environment variables:

- **`INPUTS`** — JSON string mapping `filename → absolute path` for every file in `inputs/{case_id}/`
- **`OUTPUTS`** — JSON string mapping `filename → absolute path` for each file declared in `file_outputs`

```python
import json, os
from pathlib import Path

inputs = json.loads(os.environ["INPUTS"])
outputs = json.loads(os.environ["OUTPUTS"])

# read an input file
data = json.loads(Path(inputs["config.json"]).read_text())

# write an output file
Path(outputs["result.json"]).write_text(json.dumps({"answer": 42}))
```

stdin is always available if you declare it:

```yaml
cmd: uv run python solution.py
stdin: input.json            # pipe inputs/{case_id}/input.json into stdin

tasks:
  test:
    traptask:
      source: ../task
```

stdout and stderr are captured automatically — you never need to declare them.

---

## Declaring file outputs

If your solution writes files, declare them so trap knows where to route them:

```yaml
tasks:
  test:
    cmd: uv run python solution.py
    traptask: ../task
    file_outputs:
      - result.json
      - summary.txt
```

trap creates the output paths and injects them via `OUTPUTS`. The solution writes to those paths; trap stores them under `.trap/{task}/{timestamp}/{case_id}/`.

---

---

## Cost tracking

If your solution calls an LLM API, trap can measure token usage and spend per case with no changes to your solution code.

Cost tracking activates automatically when a supported API key env var is set (e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`). Results appear in the terminal table and in `report.json`.

```
│ capital_of_france  │  PASS  │ 3.4s │ ✓ │ 100% │  28 │  14 │ $0.000007 │
```

**Mistral requires one extra line** — the Mistral SDK does not auto-read the base URL from env vars:

```python
client = Mistral(
    api_key=os.environ.get("MISTRAL_API_KEY"),
    server_url=os.environ.get("MISTRAL_BASE_URL"),   # add this line
)
```

To disable cost tracking for a run, pass `--no-cost`:

```bash
tp run --no-cost
```

→ [Full cost tracking guide](cost-tracking.md)

---

## Full trap.yaml reference

See [trap.yaml reference](../reference/trap-yaml.md) for all available fields.

## Running options

See [Running & reporting](running.md) for `tp run` flags (tags, fail-fast, output format).
