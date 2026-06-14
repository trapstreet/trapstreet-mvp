from __future__ import annotations

import json
import os
import shlex
import subprocess
from typing import TYPE_CHECKING, Any

from trap.models import SubprocessCmd
from trap.runner.capture import Capture

if TYPE_CHECKING:
    from trap.runner.task import TaskRunner


class JudgeRunner:
    def __init__(self, runner: TaskRunner, case_id: str) -> None:
        self.runner = runner
        self.case_id = case_id
        self.case_inputs_dir = runner.task_inputs_dir / case_id
        self.case_expected_dir = runner.task_expected_dir / case_id
        case_dir = runner.task_outputs_dir / case_id
        # The judge reads the solution actor's outputs + run captures, and writes
        # its own run captures into a sibling `judge/` directory.
        self.solution_dir = case_dir / "solution"
        self.solution_outputs_dir = self.solution_dir / "outputs"
        self.judge_dir = case_dir / "judge"
        self.capture = Capture.from_dir(self.judge_dir)

        assert runner.traptask_obj.judge is not None
        self.judge: SubprocessCmd = runner.traptask_obj.judge

    @property
    def _manifest(self) -> str:
        expected = self.case_expected_dir
        run = Capture.from_dir(self.solution_dir)
        return json.dumps(
            {
                "inputs_dir": str(self.case_inputs_dir.resolve()),
                "expected_dir": str(expected.resolve()) if expected.exists() else None,
                "outputs_dir": str(self.solution_outputs_dir.resolve()),
                "run": {
                    "stdout": str(run.stdout.resolve()),
                    "stderr": str(run.stderr.resolve()),
                    "meta": str(run.meta.resolve()),
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
        self.capture.write(proc.stdout, proc.stderr, {"exit_code": proc.returncode})

        if proc.returncode != 0:
            raise subprocess.CalledProcessError(proc.returncode, self.judge.cmd, proc.stdout, proc.stderr)
        return json.loads(proc.stdout)
