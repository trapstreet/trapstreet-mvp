# Loads trap.yaml (solution author's config) into TrapLoader.
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import TYPE_CHECKING

import yaml

from trap.models import Task
from trap.models.trap_yaml import TrapConfig

if TYPE_CHECKING:
    from trap.git_ops.base import ProgressCallback


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
        setup: bool = False,
        progress_func: ProgressCallback = None,
    ) -> TrapLoader:
        """Resolve a --solution spec to a loaded TrapLoader (relative to cwd).

        None → ./trap.yaml.  Local path → <path>/trap.yaml.  git+ URL
        (allow_remote only) → clone into ./<repo> (or clone_to) and load its
        trap.yaml.  Raises GitOpsError on a git failure or a bad spec/flag
        combo (caller maps it to a CLI error).

        The solution's `setup_cmd` (in its trap.yaml, so it travels with the
        solution) prepares the checkout. It auto-runs when a remote pull brought
        new code, and otherwise only when `setup` is set (`tp run --setup-solution`).
        Mirrors `TraptaskLoader.from_task`.
        """
        from trap.git_ops import GitOpsError, ParsedGitUrl, RemoteRepo

        # Each branch only resolves where trap.yaml lives (cloning a remote on the
        # way); the loader is built once and setup runs once, below.
        cwd = Path.cwd()
        is_local_changed = False
        if solution is None:
            trap_yaml_path = cwd / "trap.yaml"
        elif ParsedGitUrl.looks_remote(solution):
            if not allow_remote:
                raise GitOpsError("solution must be a local path here, not a remote URL")
            parsed = ParsedGitUrl.from_full_url(solution)
            # clone_to given → there; omitted → visible ./<repo>
            dest = clone_to or Path(parsed.basename)
            remote_repo = RemoteRepo(parsed, (cwd / dest).resolve())
            is_local_changed = remote_repo.ensure(progress_func=progress_func)
            trap_yaml_path = remote_repo.local_dir / "trap.yaml"
        else:
            if clone_to is not None:
                raise GitOpsError("--clone-to only applies to a remote (git URL) solution")
            trap_yaml_path = cwd / solution / "trap.yaml"

        loader = cls(trap_yaml_path)
        if (is_local_changed or setup) and loader.config.setup_cmd:
            # raises subprocess.CalledProcessError on non-zero exit
            subprocess.run(loader.config.setup_cmd, shell=True, cwd=loader.trap_dir, check=True)
        return loader
