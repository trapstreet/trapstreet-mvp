from __future__ import annotations

import json
import os
import shlex
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from trap.cost import CostProxy
from trap.models import CaseResult
from trap.models.cost import CaseCost

if TYPE_CHECKING:
    from trap.runner.task import TaskRunner


@dataclass
class CaseOutputsPaths:
    stdout: Path
    stderr: Path
    meta: Path

    @classmethod
    def from_dir(cls, outputs_dir: Path) -> CaseOutputsPaths:
        return cls(
            stdout=outputs_dir / "case_stdout",
            stderr=outputs_dir / "case_stderr",
            meta=outputs_dir / "case_meta.json",
        )


class CaseRunner:
    def __init__(self, runner: TaskRunner, case_id: str) -> None:
        self.runner = runner
        self.case_id = case_id
        self.case_inputs_dir = runner.task_inputs_dir / case_id
        self.case_outputs_dir = runner.task_outputs_dir / case_id
        self.case_outputs_paths = CaseOutputsPaths.from_dir(self.case_outputs_dir)

    @property
    def _stdin(self) -> str:
        task_inputs = self.runner.task.inputs
        if task_inputs and task_inputs.stdin:
            return (self.case_inputs_dir / task_inputs.stdin).read_text()
        return ""

    @property
    def _manifest(self) -> str:
        inputs = {f.name: str(f.resolve()) for f in sorted(self.case_inputs_dir.iterdir()) if f.is_file()}
        outputs = {
            name: str((self.case_outputs_dir / name).resolve()) for name in self.runner.task.file_outputs
        }
        return json.dumps({"inputs": inputs, "outputs": outputs})

    def run(self) -> CaseResult:
        self.case_outputs_dir.mkdir(parents=True, exist_ok=True)

        task = self.runner.task

        proxy: CostProxy | None = None
        proxy_env: dict[str, str] = {}
        if task.cost_enabled:
            try:
                proxy = CostProxy()
                proxy.start()
                proxy_env = proxy.env_overrides
            except Exception:
                pass

        case_cost: CaseCost | None = None
        t0 = time.monotonic()
        try:
            proc = subprocess.run(
                shlex.split(task.cmd),
                input=self._stdin,
                capture_output=True,
                text=True,
                cwd=self.runner.trap_dir,
                timeout=task.timeout,
                env={
                    **os.environ,
                    task.manifest_envvar: self._manifest,
                    **proxy_env,
                },
            )
            duration = time.monotonic() - t0
        finally:
            if proxy is not None:
                partial = proxy.stop()
                if partial.calls > 0:
                    case_cost = partial

        self.case_outputs_paths.stdout.write_text(proc.stdout)
        self.case_outputs_paths.stderr.write_text(proc.stderr)
        self.case_outputs_paths.meta.write_text(
            json.dumps({"exit_code": proc.returncode, "duration": duration})
        )
        return CaseResult(
            case_id=self.case_id, exit_code=proc.returncode, duration=duration, metrics=None, cost=case_cost
        )
