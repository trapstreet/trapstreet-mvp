# trap

> Lives at [`trapstreet-mvp/cli/`](https://github.com/AntiNoise-ai/trapstreet-mvp/tree/main/cli) — part of the trapstreet monorepo.

**Non-invasive CLI testing framework for AI prompts, agents, and workflows.**

trap treats any solution as a black box — it invokes it as a subprocess, captures outputs, then optionally scores them through a language-agnostic judge and grader. The solution doesn't need to import trap or know it exists.

## Install

```bash
# requires uv — https://docs.astral.sh/uv/getting-started/installation/

# from PyPI
uv tool install trapstreet-cli

# from git (latest main)
uv tool install "git+https://github.com/AntiNoise-ai/trapstreet-mvp.git#subdirectory=cli"
```

The command is `tp`.

## How it works

```
TRAP_MANIFEST = {inputs_dir, outputs_dir}   # directory paths
  inputs/{case_id}/  ──────────▶  solution  ──writes──▶  .trap/{task}/{ts}/{case_id}/  (= outputs_dir)

TRAPTASK_MANIFEST = {inputs_dir, expected_dir, outputs_dir}   # directory paths (expected_dir may be null)
  expected/{case_id}/ + the outputs above  ──────────▶  judge  ──▶  {metrics: any JSON}

  all case metrics  ──────────▶  grader  ──▶  {passed, score, ...}
```

Two roles, two directories, one IO contract:

- **Solution author** — writes `trap.yaml` and the solution code
- **Task author** — writes `traptask.yaml`, `inputs/`, `expected/`, and optional judge/grader scripts

## Quick start

```bash
# from examples/echo/solution/
tp run           # run all cases
tp run -t smoke  # run only cases tagged `smoke`
```

## Documentation

- [Quick start](docs/quickstart.md)
- [Writing a solution](docs/guides/writing-solution.md)
- [Writing a task](docs/guides/writing-task.md)
- [CLI reference](docs/reference/cli.md)
- [IO contract](docs/reference/io-contract.md)

## License

MIT
