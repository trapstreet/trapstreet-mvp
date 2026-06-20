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
    dirs: DirsConfig = DirsConfig()
    # Advisory declaration of what a solution produces: output filenames written
    # into the manifest's `outputs` dir, and/or the tokens `stdout` / `stderr` for
    # the standard streams. Purely a published contract for solution authors — trap
    # never enforces it; the judge is the sole arbiter (it scans `outputs` and reads
    # the `run` captures freely, so dynamic outputs stay supported). Omit if unused.
    declared_outputs: tuple[str, ...] = ()
    cases: tuple[TraptaskCase, ...]
    judge: SubprocessConfig | None = None  # None → skip per-case scoring
    grader: SubprocessConfig | None = None  # None → skip overall aggregation
    # shell command (run via shell, cwd = traptask.yaml's directory) that prepares
    # the task checkout — e.g. `uv sync` to install the judge's deps. Task-author
    # owned so a given task version sets itself up identically for every solution,
    # keeping runs reproducible and comparable. Auto-runs when a remote pull brings
    # new code; otherwise only on `tp run --setup`.
    setup_cmd: str | None = None
