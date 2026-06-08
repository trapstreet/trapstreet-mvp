from __future__ import annotations

import re
from dataclasses import dataclass

from trap.git_ops.base import GitOpsError


@dataclass(frozen=True)
class ParsedGitUrl:
    repo: str  # plain HTTPS URL (no git+ prefix, no @rev, no #fragment)
    rev: str | None  # branch / tag / SHA; None = default branch
    subdirectory: str | None  # sub-path inside the repo; None = root

    @classmethod
    def from_full_url(cls, url: str) -> ParsedGitUrl:
        """Parse git+https://host/org/repo@rev#subdirectory=X forms."""
        if not url.startswith("git+"):
            raise GitOpsError(f"not a git+ URL: {url!r}")
        rest = url[4:]

        subdirectory: str | None = None
        if "#" in rest:
            rest, fragment = rest.split("#", 1)
            for part in fragment.split("&"):
                if part.startswith("subdirectory="):
                    subdirectory = part[len("subdirectory=") :]

        rev: str | None = None
        # only look for @rev in the last path segment to avoid cutting user@host
        if "@" in rest.split("/", 3)[-1]:
            idx = rest.rfind("@")
            rest, rev = rest[:idx], rest[idx + 1 :]

        return cls(repo=rest, rev=rev, subdirectory=subdirectory)

    @property
    def basename(self) -> str:
        """https://github.com/org/my-task.git  →  my-task"""
        name = self.repo.rstrip("/").rsplit("/", 1)[-1]
        return re.sub(r"\.git$", "", name)


def normalise_remote(url: str) -> str:
    """Canonicalise a git remote URL into a clickable https URL.

    git@github.com:user/repo.git   → https://github.com/user/repo
    https://github.com/u/r.git     → https://github.com/u/r
    ssh://git@gitlab.com/u/r       → https://gitlab.com/u/r
    """
    m = re.match(r"^git@([^:]+):(.+?)(?:\.git)?$", url)  # git@host:path/to/repo(.git)
    if m:
        return f"https://{m.group(1)}/{m.group(2)}"
    m = re.match(r"^ssh://git@([^/]+)/(.+?)(?:\.git)?$", url)  # ssh:// form
    if m:
        return f"https://{m.group(1)}/{m.group(2)}"
    return re.sub(r"\.git$", "", url)  # https/http: drop trailing .git
