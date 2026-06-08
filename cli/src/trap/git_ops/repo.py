from __future__ import annotations

from pathlib import Path

import git

from trap.git_ops.base import GitOpsError, ProgressCallback
from trap.git_ops.rev import RevStrategy
from trap.git_ops.url import ParsedGitUrl, normalise_remote


class GitRepo:
    """A parsed git+ URL bound to a local clone directory (`root`).

    `ensure()` clones it (fresh) or reconciles an existing clone. The caller
    decides where to clone — `root` is the resolved directory, GitRepo holds no
    default or base-dir policy. Takes a `ParsedGitUrl` (callers usually need its
    `basename` to build `root` anyway, so parse once and pass it in).
    """

    def __init__(self, parsed: ParsedGitUrl, root: Path) -> None:
        self.parsed = parsed
        self.strategy = RevStrategy.for_rev(parsed.rev)
        self.root = root

    @property
    def local_dir(self) -> Path:
        """Clone root, descended into the requested subdirectory if any."""
        if self.parsed.subdirectory:
            return self.root / self.parsed.subdirectory
        return self.root

    def ensure(self, progress_func: ProgressCallback = None) -> bool:
        """Clone (fresh) or sync (existing) the repo into `root`.

        Returns True when code changed (fresh clone OR branch fast-forwarded) —
        callers run init_cmd only then.  Read `local_dir` for the resolved path.
        """
        return self._sync(progress_func) if self.root.exists() else self._clone(progress_func)

    def _clone(self, progress_func: ProgressCallback) -> bool:
        """Fresh clone — common scaffolding here; rev-specific clone via the strategy."""
        if progress_func:
            progress_func(f"cloning {self.parsed.repo} → {self.root}")
        try:
            self.strategy.clone(self.parsed.repo, self.root)
        except git.GitCommandError as exc:
            raise GitOpsError(f"git clone failed:\n{exc.stderr.strip()}") from exc
        return True

    def _sync(self, progress_func: ProgressCallback) -> bool:
        """Existing clone — validate remote here; rev-specific update via the strategy."""
        try:
            repo = git.Repo(self.root)
        except git.InvalidGitRepositoryError as exc:
            raise GitOpsError(f"{self.root} is not a git repository") from exc

        actual = normalise_remote(repo.remotes.origin.url)
        expected = normalise_remote(self.parsed.repo)
        if actual != expected:
            raise GitOpsError(f"repo mismatch at {self.root}:\n  declared: {expected}\n  found:    {actual}")

        return self.strategy.reconcile(repo, self.root, progress_func)
