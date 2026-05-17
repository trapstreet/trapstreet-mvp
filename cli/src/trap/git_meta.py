"""Auto-detect git metadata for a solution directory.

Called by `tp run` so reports submitted to trapstreet carry a `repo:`
field pointing back at the solution source. The user can override or
supply this manually via the `metadata:` block in trap.yaml — manual
wins on key collision.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any


def detect_metadata(solution_dir: Path) -> dict[str, Any]:
    """Look at the solution directory's git remote and return whatever
    metadata we can derive. Empty dict if not a git repo / no remote /
    git binary missing."""
    repo = _detect_remote_url(solution_dir)
    if not repo:
        return {}
    return {"repo": repo}


def _detect_remote_url(cwd: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(cwd), "config", "--get", "remote.origin.url"],
            capture_output=True,
            text=True,
            timeout=2,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    url = result.stdout.strip()
    if not url:
        return None
    return _normalise_remote(url)


def _normalise_remote(url: str) -> str:
    """Canonicalise the various remote URL forms into a clickable https
    URL. Examples:

        git@github.com:user/repo.git   → https://github.com/user/repo
        https://github.com/u/r.git     → https://github.com/u/r
        ssh://git@gitlab.com/u/r       → https://gitlab.com/u/r
    """
    # ssh form: git@host:path/to/repo(.git)
    m = re.match(r"^git@([^:]+):(.+?)(?:\.git)?$", url)
    if m:
        return f"https://{m.group(1)}/{m.group(2)}"
    # ssh:// form
    m = re.match(r"^ssh://git@([^/]+)/(.+?)(?:\.git)?$", url)
    if m:
        return f"https://{m.group(1)}/{m.group(2)}"
    # https/http form: drop trailing .git
    return re.sub(r"\.git$", "", url)
