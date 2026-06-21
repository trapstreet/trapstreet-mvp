# Loads trap.yaml (solution author's config) into TrapLoader.
from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import yaml

from trap.models import Task
from trap.models.trap_yaml import TrapConfig


class TrapLoader:
    """Loads trap.yaml (solution author's config)."""

    def __init__(self, trap_yaml_path: Path) -> None:
        self.trap_dir: Path = trap_yaml_path.resolve().parent
        data = yaml.safe_load(trap_yaml_path.read_text())
        self.config: TrapConfig = TrapConfig.model_validate(data)
        self.tasks: dict[str, Task] = {
            name: task.model_copy(update={"name": name}) for name, task in self.config.tasks.items()
        }

    def select_task(self, name: str) -> Task:
        """Return task by name."""
        if name not in self.tasks:
            raise KeyError(f"task {name!r} not found in trap.yaml")
        return self.tasks[name]

    def resolve_task(self, name: str | None) -> Task:
        """Return named task, or the first task if name is None."""
        return self.select_task(name or next(iter(self.tasks)))

    @classmethod
    def from_solution(
        cls,
        solution: str | None,
        clone_to: Path | None = None,
        *,
        allow_remote: bool = False,
        progress_func: Callable[[str], None] | None = None,
    ) -> TrapLoader:
        """Resolve a --solution spec to a loaded TrapLoader (relative to cwd).

        None → ./trap.yaml.  Local path → <path>/trap.yaml.  git+ URL
        (allow_remote only) → clone into ./<repo> (or clone_to) and load its
        trap.yaml.  Raises GitOpsError on a git failure or a bad spec/flag
        combo (caller maps it to a CLI error).
        """
        from trap.git_ops import GitOpsError, ParsedGitUrl, RemoteRepo

        cwd = Path.cwd()
        if solution is None:
            return cls(cwd / "trap.yaml")
        if ParsedGitUrl.looks_remote(solution):
            if not allow_remote:
                raise GitOpsError("solution must be a local path here, not a remote URL")
            parsed = ParsedGitUrl.from_full_url(solution)
            # clone_to given → there; omitted → visible ./<repo>
            dest = clone_to or Path(parsed.basename)
            remote_repo = RemoteRepo(parsed, (cwd / dest).resolve())
            remote_repo.ensure(progress_func=progress_func)
            return cls(remote_repo.local_dir / "trap.yaml")
        if clone_to is not None:
            raise GitOpsError("--clone-to only applies to a remote (git URL) solution")
        return cls(cwd / solution / "trap.yaml")
