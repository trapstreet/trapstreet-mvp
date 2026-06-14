from __future__ import annotations

import json
import os
import shlex
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from trap.models import SubprocessCmd

if TYPE_CHECKING:
    from trap.runner.task import TaskRunner


@dataclass
class JudgeOutputsPaths:
    stdout: Path
    stderr: Path
    meta: Path

    @classmethod
    def from_dir(cls, outputs_dir: Path) -> JudgeOutputsPaths:
        return cls(
            stdout=outputs_dir / "judge_stdout",
            stderr=outputs_dir / "judge_stderr",
            meta=outputs_dir / "judge_meta.json",
        )


class JudgeRunner:
    def __init__(self, runner: TaskRunner, case_id: str) -> None:
        self.runner = runner
        self.case_id = case_id
        self.case_inputs_dir = runner.task_inputs_dir / case_id
        self.case_outputs_dir = runner.task_outputs_dir / case_id
        self.case_expected_dir = runner.task_expected_dir / case_id
        self.judge_outputs_paths = JudgeOutputsPaths.from_dir(self.case_outputs_dir)

        assert runner.traptask_obj.judge is not None
        self.judge: SubprocessCmd = runner.traptask_obj.judge

    @staticmethod
    def _namespace(dir_path: Path) -> dict[str, str]:
        if not dir_path.exists():
            return {}
        return {f.name: str(f.resolve()) for f in sorted(dir_path.iterdir()) if f.is_file()}

    @property
    def _manifest(self) -> str:
        return json.dumps(
            {
                "inputs": self._namespace(self.case_inputs_dir),
                "outputs_dir": str(self.case_outputs_dir.resolve()),
                "expected": self._namespace(self.case_expected_dir),
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
        self.judge_outputs_paths.stdout.write_text(proc.stdout)
        self.judge_outputs_paths.stderr.write_text(proc.stderr)
        self.judge_outputs_paths.meta.write_text(json.dumps({"exit_code": proc.returncode}))

        if proc.returncode != 0:
            raise subprocess.CalledProcessError(proc.returncode, self.judge.cmd, proc.stdout, proc.stderr)
        return json.loads(proc.stdout)
