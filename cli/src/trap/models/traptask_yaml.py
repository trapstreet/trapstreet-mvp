# Models for traptask.yaml (task author's config).
from __future__ import annotations

from pydantic import BaseModel


class SubprocessConfig(BaseModel):
    # How to invoke the judge/grader subprocess: the command (run via shlex.split,
    # cwd = traptask.yaml's directory) plus the env var carrying its manifest.
    cmd: str
    manifest_envvar: str = "TRAPTASK_MANIFEST"


class DirsConfig(BaseModel):
    # paths relative to traptask.yaml; outputs dir is a runtime tmpdir, not declared here
    inputs: str = "inputs/"
    expected: str = "expected/"


class TraptaskCase(BaseModel):
    id: str
    description: str = ""
    tags: tuple[str, ...] = ()
    skip: bool = False


class TraptaskConfig(BaseModel):
    # Field order mirrors the canonical traptask.yaml layout.
    # Prepares the checkout (e.g. `uv sync`); task-author owned so every solution gets
    # an identical env. Auto-runs on a remote clone/update; else `tp run --setup`.
    setup_cmd: str | None = None
    dirs: DirsConfig = DirsConfig()
    # Advisory contract: filenames (and/or `stdout`/`stderr`) the solution writes.
    # Never enforced — the judge is the sole arbiter. Omit for dynamic outputs.
    declared_outputs: tuple[str, ...] = ()
    cases: tuple[TraptaskCase, ...]
    judge: SubprocessConfig | None = None  # None → skip per-case scoring
    grader: SubprocessConfig | None = None  # None → skip overall aggregation
