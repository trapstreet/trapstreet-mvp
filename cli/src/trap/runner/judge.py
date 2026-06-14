from __future__ import annotations

import json
import os
import shlex
import subprocess
from typing import TYPE_CHECKING, Any

from trap.models import SubprocessCmd
from trap.runner.layout import CaseLayout

if TYPE_CHECKING:
    from trap.runner.task import TaskRunner


class JudgeRunner:
    def __init__(self, runner: TaskRunner, case_id: str) -> None:
        self.runner = runner
        self.case_id = case_id
        self.case_inputs_dir = runner.task_inputs_dir / case_id  # task-repo side
        self.case_expected_dir = runner.task_expected_dir / case_id  # task-repo side
        self.layout = CaseLayout.for_case(runner.run_dir, case_id)  # workspace side

        assert runner.traptask_obj.judge is not None
        self.judge: SubprocessCmd = runner.traptask_obj.judge

    @property
    def _manifest(self) -> str:
        expected_dir = self.case_expected_dir
        solution_capture = self.layout.solution_capture
        return json.dumps(
            {
                "inputs_dir": str(self.case_inputs_dir.resolve()),
                "expected_dir": str(expected_dir.resolve()) if expected_dir.exists() else None,
                "outputs_dir": str(self.layout.outputs_dir.resolve()),
                "run": {
                    "stdout": str(solution_capture.stdout.resolve()),
                    "stderr": str(solution_capture.stderr.resolve()),
                    "meta": str(solution_capture.meta.resolve()),
                },
            }
        )

    def run(self) -> Any:
        proc = subprocess.run(
            shlex.split(self.judge.cmd),
            env={**os.environ, self.judge.manifest_envvar: self._manifest},
            cwd=self.runner.traptask_dir,
            capture_output=True,
            text=True,
        )
        self.layout.judge_capture.write(proc.stdout, proc.stderr, {"exit_code": proc.returncode})

        if proc.returncode != 0:
            raise subprocess.CalledProcessError(proc.returncode, self.judge.cmd, proc.stdout, proc.stderr)
        return json.loads(proc.stdout)
