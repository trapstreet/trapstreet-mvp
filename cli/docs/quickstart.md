# Quick start

This guide walks through the `examples/echo/` example that ships with trap. It takes about 5 minutes and covers both sides of the IO contract.

The echo solution reads a JSON object from stdin and prints the `message` field to stdout. The task verifies that output using a judge and grader.

---

## Install

**Step 1 — install uv** (if you don't have it):

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.sh | iex"

# or via Homebrew
brew install uv
```

**Step 2 — install trap:**

```bash
# from PyPI (recommended)
uv tool install trapstreet-cli

# from git (latest main, no PyPI release needed)
uv tool install "git+https://github.com/AntiNoise-ai/trapstreet-mvp.git#subdirectory=cli"
```

The installed command is `tp`. Verify:

```bash
tp --help
```

---

## The solution side

`examples/echo/solution/echo.py` reads JSON from stdin and prints `message` to stdout:

```python
import json, sys
data = json.load(sys.stdin)
if "message" not in data:
    print("error: missing 'message' field", file=sys.stderr)
    sys.exit(1)
print(data["message"])
```

`examples/echo/solution/trap.yaml` tells trap how to run it:

```yaml
tasks:
  test:
    description: Echo solution — reads stdin JSON, writes it back to stdout
    cmd: uv run python echo.py
    traptask: ../task          # path to the task directory
    stdin: input.json          # pipe inputs/{case_id}/input.json into stdin
```

---

## The task side

`examples/echo/task/traptask.yaml` defines the cases and points at the judge and grader:

```yaml
cases:
  - id: contains_basic
    description: stdout contains the substring (case-insensitive)
    tags: [smoke]
  - id: exit_code_failure
    description: exit code is 1 when message field is missing
  - id: skipped_example
    skip: true
    tags: [wip]

judge:
  cmd: .venv/bin/python judge.py

grader:
  cmd: .venv/bin/python grader.py
```

Each case has a directory under `inputs/{id}/` holding the files for that case. The judge reads `TRAPTASK_PAYLOAD` (a JSON string with paths to inputs, outputs, and expected files) and prints a score to stdout. The grader receives all case results and prints the final verdict.

---

## Run it

From `examples/echo/solution/`:

```bash
tp run                    # run the default task
tp run test               # run the named task
tp run -t smoke           # only run cases tagged `smoke`
tp run --output json      # machine-readable JSON output
tp run --fail-fast        # stop on first failing case
```

trap writes run artifacts to `.trap/{task}/{timestamp}/` and updates a `latest` symlink.

To re-display a stored run without re-executing the solution:

```bash
tp report
tp report test            # named task
tp report test latest     # explicit run
```

---

## What's next

- [Writing a solution](guides/writing-solution.md) — configure `trap.yaml` for your own solution
- [Writing a task](guides/writing-task.md) — build a benchmark with judge and grader
- [Running & reporting](guides/running.md) — full `tp run` options reference
