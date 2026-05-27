// Docs source-of-truth. Markdown rendered via <MarkdownBlock>. When this
// grows past a single page, split into multiple route files.

export const BUILD_A_TASK_MD = `
We're going to build a task called \`sum-two-numbers\`. Solutions get
two ints in a JSON file. They write a program that adds them and
writes the sum to another JSON file. We score whether their answer
matches ours. Whole thing takes about 15 minutes.

## What you're making

A task is a folder. Four things live in it:

- **\`inputs/<case>/\`** — what we hand the solution's program
- **\`expected/<case>/\`** — what we expected back
- **\`judge.py\`** — scores one case
- **\`grader.py\`** — aggregates case scores into a run-level pass/fail

Plus a \`traptask.yaml\` that wires them together. That's the whole
contract — the solution's solution and your task talk through files
and environment variables only.

## Step 1 — make the case files

\`\`\`bash
mkdir -p sum-task/inputs/basic     sum-task/expected/basic
mkdir -p sum-task/inputs/negatives sum-task/expected/negatives
mkdir -p sum-task/inputs/zero      sum-task/expected/zero
\`\`\`

Inputs:

\`\`\`bash
echo '{"a":  3, "b":  5}' > sum-task/inputs/basic/nums.json
echo '{"a": -1, "b": -2}' > sum-task/inputs/negatives/nums.json
echo '{"a":  0, "b":  0}' > sum-task/inputs/zero/nums.json
\`\`\`

Expected outputs:

\`\`\`bash
echo '{"sum":  8}' > sum-task/expected/basic/sum.json
echo '{"sum": -3}' > sum-task/expected/negatives/sum.json
echo '{"sum":  0}' > sum-task/expected/zero/sum.json
\`\`\`

Three cases, three inputs, three expected outputs. The folder names
under \`inputs/\` and \`expected/\` are the **case ids**.

## Step 2 — write the judge

\`judge.py\` runs once per case. It reads where the solution wrote its
output (and where you put the expected answer), decides whether they
match, and prints a JSON object containing at least a numeric \`score\`.

\`\`\`python
# sum-task/judge.py
import json, os
from pathlib import Path

payload = json.loads(os.environ["TRAPTASK_PAYLOAD"])

actual   = json.loads(Path(payload["outputs"]["sum.json"]).read_text())
expected = json.loads(Path(payload["expected"]["sum.json"]).read_text())

correct = actual.get("sum") == expected["sum"]
print(json.dumps({
    "score": 1.0 if correct else 0.0,
    "correct": correct,
}))
\`\`\`

That's it. \`TRAPTASK_PAYLOAD\` is a JSON string giving you absolute
paths into the solution's output dir and your expected dir for this
case. You read what's there, decide, print one line.

## Step 3 — write the grader (or skip it)

\`grader.py\` runs once at the end. It gets the list of case results
and produces one run-level summary:

\`\`\`python
# sum-task/grader.py
import json, os

cases = json.loads(os.environ["TRAPTASK_PAYLOAD"])
scores = [c["metrics"]["score"] for c in cases if c.get("metrics")]
avg = sum(scores) / len(scores) if scores else 0
print(json.dumps({
    "passed": all(s == 1.0 for s in scores),
    "score":  round(avg, 3),
}))
\`\`\`

**You can skip writing \`grader.py\` entirely.** If it's missing, the
server averages the case scores for you and calls it \`passed\` when
the average crosses 0.8. Write your own only when you want a stricter
rule (here we want **every** case at 1.0 to count as passed).

## Step 4 — wire it up with traptask.yaml

\`\`\`yaml
# sum-task/traptask.yaml
dirs:
  inputs: inputs/
  expected: expected/

cases:
  - id: basic
  - id: negatives
  - id: zero

judge:
  cmd: uv run python judge.py

grader:
  cmd: uv run python grader.py
\`\`\`

You also need a \`pyproject.toml\` next to \`traptask.yaml\` so \`uv run\`
can build a venv for judge/grader:

\`\`\`toml
[project]
name = "sum-task"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = []
\`\`\`

That's the task. Push the \`sum-task/\` folder up to a GitHub repo.

## Step 5 — publish on trapstreet

Go to \`/tasks/new\`, paste your task's GitHub URL into the auto-fill
field, review the prefilled values, hit Create. Now anyone with the
\`tp\` CLI can write a solver against it.

When you create the task as **public**, trapstreet requires every
submitted solution to have a publicly reachable git repo
(\`metadata.repo\`) — see [build a solution](/docs/build-a-solution) for
how that flows from the solver side.

## What you didn't have to think about

- Test solution orchestration — \`tp\` runs each case in its own
  subprocess, captures stdout, handles timeouts, you don't write any
  of that.
- File paths — your judge / grader read \`TRAPTASK_PAYLOAD\` and never
  deal with cwd or relative paths.
- Result storage — \`.trap/sum-two-numbers/<ts>/report.json\` is
  produced automatically, ready to upload.
- Leaderboard columns, ranking, dedup — server picks well-known
  metric names from what your grader emits (\`score\`, \`passed\`,
  \`latency_ms_*\`, \`cost_usd_total\`) and renders columns. Zero
  config needed; see [the reference](/docs/reference) when you want
  something custom.

## Gotchas worth remembering

- **Case ids are folder names.** \`inputs/basic/\` and
  \`expected/basic/\` must match exactly.
- **judge.py output schema is yours.** Whatever JSON keys you print
  flow through to \`runs.metrics\`; pick names you'll want to see on
  the leaderboard.
- **\`grader.py\` is optional.** Skip it unless you need a non-default
  pass rule.

| You write | Runs | Reads | Emits |
|-----------|------|-------|-------|
| \`judge.py\` | per case | \`TRAPTASK_PAYLOAD\` | JSON with at least \`score\` |
| \`grader.py\` | once at the end | list of case metrics | JSON with at least \`passed\`, \`score\` |
| (auto fallback) | once if no grader | case scores | averages, marks passed at ≥ 0.8 |
`;

export const BUILD_A_SOLUTION_MD = `
We're going to write a solver for the \`sum-two-numbers\` task from
[build a task](/docs/build-a-task). It hands you two ints, expects you
back their sum. About 5 minutes once you have \`uv\` + \`tp\`.

## What you're making

A folder with two files:

- **\`solve.py\`** — your program. Reads inputs, writes outputs.
- **\`trap.yaml\`** — points at the task, declares which files come in
  and go out.

That's it. No framework code. \`tp run\` orchestrates each case for you.

## Step 1 — write solve.py

\`\`\`python
# my-solution/solve.py
import json, os
from pathlib import Path

inputs  = json.loads(os.environ["INPUTS"])
outputs = json.loads(os.environ["OUTPUTS"])

nums = json.loads(Path(inputs["nums.json"]).read_text())
Path(outputs["sum.json"]).write_text(json.dumps({"sum": nums["a"] + nums["b"]}))
\`\`\`

Two env vars are everything:

| Env var | What it holds | Example |
|---------|---------------|---------|
| \`INPUTS\` | JSON dict, \`filename → absolute path\` for case inputs | \`{"nums.json": "/tmp/.trap/.../inputs/basic/nums.json"}\` |
| \`OUTPUTS\` | JSON dict, \`filename → absolute path\` for each declared file output | \`{"sum.json": "/tmp/.trap/.../basic/sum.json"}\` |

You can also use stdin / stdout — \`tp\` captures both automatically.
Many LLM solvers print the answer to stdout and let the task's judge
parse it.

## Step 2 — write trap.yaml

\`\`\`yaml
# my-solution/trap.yaml
tasks:
  sum-two-numbers:                 # must match the task id on trapstreet
    cmd: uv run python solve.py
    traptask: ../sum-task          # path to the cloned task folder
    inputs:
      files: [nums.json]
    file_outputs: [sum.json]
    metadata:
      framework: stdlib-python
      model: hand-written
\`\`\`

The \`metadata:\` block is self-reported and flows through to the
leaderboard row. \`tp run\` auto-fills \`repo:\` from \`git remote\` if
you've git-init'd the folder. For **public tasks**, trapstreet rejects
your submission unless \`metadata.repo\` resolves to a publicly
reachable GitHub URL — so push your solver first.

## Step 3 — run it locally

\`\`\`bash
cd my-solution
tp run
\`\`\`

\`uv\` builds a venv from your \`pyproject.toml\` (any will do, even an
empty one), runs each case, runs the task's judge, prints a summary.
All scores should be 1.0 on the basic / negatives / zero cases.

## Step 4 — submit

\`\`\`bash
tp auth login           # one-time browser OAuth, see quick start
tp submit sum-two-numbers
\`\`\`

The CLI prints a \`view_url\`. Click it; your row's on the leaderboard.

## What you didn't have to think about

- HTTP, auth, retries — \`tp submit\` handles it.
- Per-case scoring — the task author already wrote \`judge.py\`. You
  just hand back the right output.
- Capturing stdout/stderr/latency/exit_code — \`tp\` records it all.
- Submitting from the same machine you ran on — you can copy
  \`.trap/<task>/<ts>/report.json\` anywhere and submit from there.

## Gotchas worth remembering

- **\`INPUTS\` keys are filenames, not paths.** Use
  \`INPUTS["nums.json"]\`, not \`INPUTS["inputs/basic/nums.json"]\`.
- **The task id must match in three places**: your trap.yaml's
  top-level key, the trapstreet task id, and the argument to
  \`tp submit\`.
- **Use \`uv run python ...\` in your cmd**, not \`.venv/bin/python\`.
  The first lets uv build the venv; the second only works after a
  manual setup.
- **Public tasks require a public repo.** Push your code to GitHub
  before \`tp submit\` or it's rejected — \`tp run\` auto-detects the
  remote URL into \`metadata.repo\`, or set it explicitly in trap.yaml.
`;
