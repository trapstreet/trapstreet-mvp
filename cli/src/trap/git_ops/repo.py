from __future__ import annotations

from pathlib import Path

import git

from trap.git_meta import _normalise_remote
from trap.git_ops.base import GitOpsError, ProgressCallback
from trap.git_ops.rev import RevStrategy
from trap.git_ops.url import ParsedGitUrl


class GitRepo:
    """A git+ URL bound to a local clone directory under base_dir.

    `ensure()` clones it (fresh) or reconciles an existing clone, returning the
    local directory and whether the code changed.
    """

    def __init__(self, url: str, path: str | None, base_dir: Path) -> None:
        self.parsed = ParsedGitUrl.from_full_url(url)
        self.strategy = RevStrategy.for_rev(self.parsed.rev)
        self.path = path
        self.base_dir = base_dir

    @property
    def root(self) -> Path:
        """Local clone root: explicit path, or cache under .trap/repos/<repo>."""
        if self.path is None:
            return self.base_dir / ".trap" / "repos" / self.parsed.basename
        p = Path(self.path)
        return p if p.is_absolute() else (self.base_dir / p).resolve()

    @property
    def local_dir(self) -> Path:
        """Clone root, descended into the requested subdirectory if any."""
        if self.parsed.subdirectory:
            return self.root / self.parsed.subdirectory
        return self.root

    def ensure(self, progress: ProgressCallback = None) -> bool:
        """Clone (fresh) or sync (existing) the repo into `root`.

        Returns True when code changed (fresh clone OR branch fast-forwarded) —
        callers run init_cmd only then.  Read `local_dir` for the resolved path.
        """
        return self._sync(progress) if self.root.exists() else self._clone(progress)

    def _clone(self, progress: ProgressCallback) -> bool:
        """Fresh clone — common scaffolding here; rev-specific clone via the strategy."""
        if progress:
            progress(f"cloning {self.parsed.repo} → {self.root}")
        try:
            self.strategy.clone(self.parsed.repo, self.root)
        except git.GitCommandError as exc:
            raise GitOpsError(f"git clone failed:\n{exc.stderr.strip()}") from exc
        return True

    def _sync(self, progress: ProgressCallback) -> bool:
        """Existing clone — validate remote here; rev-specific update via the strategy."""
        try:
            repo = git.Repo(self.root)
        except git.InvalidGitRepositoryError as exc:
            raise GitOpsError(f"{self.root} is not a git repository") from exc

        actual = _normalise_remote(repo.remotes.origin.url)
        expected = _normalise_remote(self.parsed.repo)
        if actual != expected:
            raise GitOpsError(f"repo mismatch at {self.root}:\n  declared: {expected}\n  found:    {actual}")

        return self.strategy.reconcile(repo, self.root, progress)
