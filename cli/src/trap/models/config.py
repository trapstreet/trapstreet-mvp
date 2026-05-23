# Models for trap.yaml (solution author's config).
from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class InputsBinding(BaseModel):
    stdin: str | None = None  # filename in inputs/{case_id}/ piped as subprocess stdin
    # declared input keys; runner validates these stems exist in inputs/{case_id}/ before running
    files: tuple[str, ...] = ()
    # all files in inputs/{case_id}/ are also exposed via INPUTS env var at runtime
    # TODO: args: list[str] = []   — pass inputs as CLI positional/named arguments
    # TODO: env: dict[str, str] = {}  — inject inputs as environment variables


class Task(BaseModel):
    name: str = ""
    description: str = ""
    cmd: str
    traptask: str  # path to traptask directory (relative to trap.yaml); trap looks for traptask.yaml inside
    inputs: InputsBinding | None = None
    # output filenames; solution writes each to the path given by outputs_envvar[name] at runtime
    file_outputs: tuple[str, ...] = ()
    timeout: int = 30
    # env var names injected by the runner; override if the solution already uses these names
    inputs_envvar: str = "INPUTS"
    outputs_envvar: str = "OUTPUTS"
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
    solution: str | None = None
