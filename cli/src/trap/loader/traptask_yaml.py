# Loads traptask.yaml (task author's config) into TraptaskLoader.
from __future__ import annotations

import subprocess
from collections.abc import Iterable
from pathlib import Path

import yaml

from trap.models import Task, TraptaskCase, TraptaskConfig


class TraptaskLoader:
    """Loads traptask.yaml (task author's config) and resolves runtime paths."""

    def __init__(self, traptask_yaml_path: Path) -> None:
        self.traptask_dir: Path = traptask_yaml_path.resolve().parent
        if traptask_yaml_path.exists():
            self.traptask = TraptaskConfig.model_validate(yaml.safe_load(traptask_yaml_path.read_text()))
        else:
            self.traptask = self._discover(self.traptask_dir)
        self.inputs_dir: Path = (self.traptask_dir / self.traptask.dirs.inputs).resolve()
        self.expected_dir: Path = (self.traptask_dir / self.traptask.dirs.expected).resolve()

    @staticmethod
    def _discover(traptask_dir: Path) -> TraptaskConfig:
        """Auto-build TraptaskConfig by scanning inputs/ when traptask.yaml is absent."""
        inputs_dir = traptask_dir / "inputs"
        if not inputs_dir.is_dir():
            raise FileNotFoundError(f"no traptask.yaml and no inputs/ directory found in {traptask_dir}")
        case_ids = sorted(p.name for p in inputs_dir.iterdir() if p.is_dir())
        if not case_ids:
            raise FileNotFoundError(f"inputs/ in {traptask_dir} has no case subdirectories")
        return TraptaskConfig(cases=tuple(TraptaskCase(id=case_id) for case_id in case_ids))

    @classmethod
    def from_task(cls, task: Task, trap_dir: Path, setup: bool = False) -> TraptaskLoader:
        """Resolve traptask.yaml from a Task's traptask field and the trap.yaml directory.

        Mirrors `TrapLoader.from_solution`: `source` is a local path or a git+ URL.
        A URL clones into `clone_to` (omitted → hidden cache .trap/repos/<repo>,
        since the task is a dependency); a local path uses it in place and rejects
        `clone_to`. Raises GitOpsError on a bad spec (caller maps it to a CLI error).

        The task's `setup_cmd` (declared in its traptask.yaml, so it travels with the
        task version) prepares the checkout. It auto-runs when a remote pull brought
        new code, and otherwise only when `setup` is set (the `tp run --setup`
        escape hatch covering pinned/up-to-date clones and local sources).
        """
        from trap.git_ops import GitOpsError, ParsedGitUrl, RemoteRepo

        spec = task.traptask
        if ParsedGitUrl.looks_remote(spec.source):
            parsed = ParsedGitUrl.from_full_url(spec.source)
            dest = spec.clone_to or Path(".trap") / "repos" / parsed.basename
            remote_repo = RemoteRepo(parsed, (trap_dir / dest).resolve())
            is_local_changed = remote_repo.ensure()
            traptask_dir = remote_repo.local_dir
        else:
            if spec.clone_to is not None:
                raise GitOpsError("traptask.clone_to only applies to a remote (git URL) source")
            is_local_changed = False
            traptask_dir = (trap_dir / spec.source).resolve()
        loader = cls(traptask_dir / "traptask.yaml")
        if (is_local_changed or setup) and loader.traptask.setup_cmd:
            # raises subprocess.CalledProcessError on non-zero exit
            subprocess.run(loader.traptask.setup_cmd, shell=True, cwd=loader.traptask_dir, check=True)
        return loader

    @property
    def cases(self) -> tuple[TraptaskCase, ...]:
        """Return all non-skipped cases."""
        return tuple(c for c in self.traptask.cases if not c.skip)

    def cases_with_tags(self, tags: Iterable[str] | None = None) -> tuple[TraptaskCase, ...]:
        """Return non-skipped cases matching any of the specified tags, or all cases if tags is empty/None."""
        if not (tag_set := set(tags or ())):
            return self.cases
        return tuple(c for c in self.cases if not tag_set.isdisjoint(c.tags))
