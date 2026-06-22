# CLI reference

The installed command is `tp`.

---

## tp run

Run a task against a solution.

```
tp run [TASK] [OPTIONS]
```

| Argument / Flag | Default | Description |
|---|---|---|
| `TASK` (positional) | first task in `trap.yaml` | Task alias (the `tasks:` key) to run |
| `--config / -c` | `trap.yaml` | Path to the trap config file |
| `--tag / -t` | (none) | Filter cases by tag; repeatable |
| `--output / -o` | `rich` | Report renderer: `rich` or `json` |
| `--fail-fast` | `false` | Stop after the first case whose solution exits non-zero |
| `--setup-solution` | `false` | Force-run the solution's `setup_cmd` even when no remote pull brought new code |
| `--setup-task` | `false` | Force-run the task's `setup_cmd` even when no remote pull brought new code |
| `--cost / --no-cost` | `--cost` (on) | Track LLM token usage/spend via the proxy (providers auto-detected from env) |
| `--workspace / -w` | `.trap` | Directory to write run artifacts |

**Exit codes:**

| Code | Condition |
|---|---|
| `0` | Every case exited 0 |
| `1` | At least one case had a non-zero exit code |

---

## tp report

Display a report for a stored run without re-executing the solution.

```
tp report [TASK] [RUN] [OPTIONS]
```

| Argument / Flag | Default | Description |
|---|---|---|
| `TASK` (positional) | first task in `trap.yaml` | Task alias (the `tasks:` key) |
| `RUN` (positional) | `latest` | Timestamp directory name or `latest` alias |
| `--config / -c` | `trap.yaml` | Path to the trap config file |
| `--output / -o` | `rich` | Report renderer: `rich` or `json` |
| `--workspace / -w` | `.trap` | Directory containing run artifacts |

---

## tp login

Authenticate with trapstreet.run to enable run submission.

```
tp login [OPTIONS]
```

| Flag | Default | Description |
|---|---|---|
| `--api-key` | (from `TRAPSTREET_API_KEY` or `~/.config/trapstreet/auth.json`) | API key |
| `--server` | `https://trapstreet.run` | Server URL |
