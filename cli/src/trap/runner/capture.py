from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class Capture:
    """The stdout/stderr/meta files trap writes for one actor's run.

    Each actor (solution, judge, grader) gets its own directory; the capture
    files are unprefixed within it (so `solution/stdout`, `judge/stdout`).
    """

    stdout: Path
    stderr: Path
    meta: Path

    @classmethod
    def from_dir(cls, actor_dir: Path) -> Capture:
        return cls(
            stdout=actor_dir / "stdout",
            stderr=actor_dir / "stderr",
            meta=actor_dir / "meta.json",
        )

    def write(self, stdout: str, stderr: str, meta: dict[str, Any]) -> None:
        """Create the actor directory and persist its run's stdout/stderr/meta."""
        self.stdout.parent.mkdir(parents=True, exist_ok=True)
        self.stdout.write_text(stdout)
        self.stderr.write_text(stderr)
        self.meta.write_text(json.dumps(meta))
