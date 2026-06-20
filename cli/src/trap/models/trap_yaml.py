# Models for trap.yaml (solution author's config).
from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import BaseModel


class CostConfig(BaseModel):
    enabled: bool = True


class TaskSource(BaseModel):
    # local task dir XOR git+ URL (relative to trap.yaml), same polymorphic form
    # as --solution; omitted → ../task. A git+ URL clones into clone_to.
    source: str = "../task"
    # clone target for a git+ source (relative to trap.yaml, or absolute);
    # omitted → hidden cache .trap/repos/<repo>. Only valid when source is a URL.
    clone_to: Path | None = None


class Task(BaseModel):
    # A task binding: which task this solution is run against, plus the knobs
    # that legitimately vary per task. Solution-invariant settings sit at the
    # top level of trap.yaml (see TrapConfig).
    name: str = ""
    description: str = ""
    traptask: TaskSource = TaskSource()  # local path or git+ URL (+ optional clone_to)
    timeout: int = 30


class TrapConfig(BaseModel):
    # trap.yaml is one solution's file: its invariant settings sit at the top
    # level (flat, 1:1 with the YAML), and `tasks` is the collection of task
    # bindings it is run against.
    cmd: str  # run via shlex.split, cwd = the trap.yaml directory
    stdin: str | None = None  # optional: filename in inputs/{case_id}/ piped to the solution's stdin
    # env var holding the run manifest (inputs_dir / outputs_dir → directory paths),
    # injected by the runner; override if the solution needs another name
    manifest_envvar: str = "TRAP_MANIFEST"
    # self-reported solution profile — e.g. {model, framework, max_tokens}.
    # Free-form; never validated by trap or trapstreet. Plumbed through to
    # report.json's `metadata` field for the leaderboard's "Solution metadata"
    # panel. See trapstreet/docs/scoring-and-metrics.md.
    metadata: dict[str, Any] = {}
    # Optional leaderboard identity. When set, `tp submit` will create
    # this solution on first upload (or reuse it on subsequent uploads)
    # under the authenticated user — letting one human run multiple
    # named agents in parallel (e.g. "claude-sonnet-baseline" vs
    # "gpt-5-baseline"). When omitted, the server auto-assigns a
    # serialised name like `<user-slug>-<n>`, so each submit lands as
    # its own row on the leaderboard.
    name: str | None = None
    cost: CostConfig | None = None  # None = auto-detect from env; set enabled: false to disable
    tasks: dict[str, Task]

    @property
    def cost_enabled(self) -> bool:
        return self.cost is None or self.cost.enabled
