# Models for traptask.yaml (task author's config).
from __future__ import annotations

from pydantic import BaseModel


class SubprocessCmd(BaseModel):
    # cmd is relative to traptask.yaml's directory and run via shlex.split
    cmd: str
    manifest_envvar: str = "TRAPTASK_MANIFEST"


class DirsConfig(BaseModel):
    # paths relative to traptask.yaml; outputs dir is a runtime tmpdir, not declared here
    inputs: str = "inputs/"
    expected: str = "expected/"


class TrapTaskCase(BaseModel):
    id: str
    description: str = ""
    tags: tuple[str, ...] = ()
    skip: bool = False


class TrapTask(BaseModel):
    dirs: DirsConfig = DirsConfig()
    cases: tuple[TrapTaskCase, ...]
    judge: SubprocessCmd | None = None  # None → skip per-case scoring
    grader: SubprocessCmd | None = None  # None → skip overall aggregation
