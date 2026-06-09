from __future__ import annotations

from pathlib import Path
from typing import Any

import git

from trap.git_ops.url import ParsedGitUrl


def read_provenance(checkout_dir: Path) -> dict[str, Any]:
    """Git provenance of a checkout, for reproducible reports.

    Returns {repo, commit} only for a *clean* git checkout that has an `origin`
    remote — others can `git clone <repo>` + `checkout <commit>` to reproduce.
    A dirty tree (tracked-file changes), no origin, or a non-git dir → {}: the
    run isn't reproducible from remote+commit alone, so we claim nothing.

    Untracked files (run outputs under .trap/, .venv, …) are ignored — only
    modifications to tracked files count as dirty.
    """
    try:
        repo = git.Repo(checkout_dir, search_parent_directories=True)
    except (git.InvalidGitRepositoryError, git.NoSuchPathError):
        return {}
    try:
        url = repo.remotes.origin.url
    except AttributeError:
        return {}  # no `origin` remote
    if not repo.head.is_valid() or repo.is_dirty():
        return {}
    return {"repo": ParsedGitUrl.from_full_url(url).normalised_url, "commit": repo.head.commit.hexsha}
