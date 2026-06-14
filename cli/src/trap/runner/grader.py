from __future__ import annotations

import json
import os
import shlex
import subprocess
from typing import TYPE_CHECKING, Any

from trap.models import CaseResult, SubprocessCmd
from trap.runner.capture import Capture

if TYPE_CHECKING:
    from trap.runner.task import TaskRunner


class GraderRunner:
    def __init__(self, runner: TaskRunner, case_results: tuple[CaseResult, ...]) -> None:
        assert runner.traptask_obj.grader is not None
        self.grader: SubprocessCmd = runner.traptask_obj.grader
        self.runner = runner
        self.cases = case_results
        # Run-level grader gets its own `grader/` directory next to report.json.
        self.grader_dir = runner.task_outputs_dir / "grader"
        self.capture = Capture.from_dir(self.grader_dir)

    @property
    def _manifest(self) -> str:
        return json.dumps([c.model_dump() for c in self.cases])

    def run(self) -> Any:
        proc = subprocess.run(
            shlex.split(self.grader.cmd),
            env={**os.environ, self.grader.manifest_envvar: self._manifest},
            cwd=self.runner.traptask_dir,
            capture_output=True,
            text=True,
        )
        self.capture.write(proc.stdout, proc.stderr, {"exit_code": proc.returncode})
        if proc.returncode != 0:
            raise subprocess.CalledProcessError(proc.returncode, self.grader.cmd, proc.stdout, proc.stderr)
        return json.loads(proc.stdout)
