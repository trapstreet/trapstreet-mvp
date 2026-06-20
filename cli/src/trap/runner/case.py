from __future__ import annotations

import json
import os
import shlex
import subprocess
import time
from typing import TYPE_CHECKING

from trap.cost import CostProxy
from trap.models import CaseResult
from trap.models.cost import CaseCost

if TYPE_CHECKING:
    from trap.runner.layout import CaseLayout
    from trap.runner.task import TaskRunner


class CaseRunner:
    def __init__(self, runner: TaskRunner, case_id: str, layout: CaseLayout) -> None:
        self.runner = runner
        self.case_id = case_id
        self.case_inputs_dir = runner.task_inputs_dir / case_id  # task-repo side
        self.layout = layout  # workspace side

    @property
    def _stdin(self) -> str:
        stdin = self.runner.trap_config.stdin
        if stdin:
            return (self.case_inputs_dir / stdin).read_text()
        return ""

    @property
    def _manifest(self) -> str:
        return json.dumps(
            {
                "inputs_dir": str(self.case_inputs_dir.resolve()),
                "outputs_dir": str(self.layout.outputs_dir.resolve()),
            }
        )

    def run(self) -> CaseResult:
        self.layout.outputs_dir.mkdir(parents=True, exist_ok=True)

        task = self.runner.task
        trap_config = self.runner.trap_config

        proxy: CostProxy | None = None
        proxy_env: dict[str, str] = {}
        if trap_config.cost_enabled:
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
                shlex.split(trap_config.cmd),
                input=self._stdin,
                capture_output=True,
                text=True,
                cwd=self.runner.trap_dir,
                timeout=task.timeout,
                env={
                    **os.environ,
                    trap_config.manifest_envvar: self._manifest,
                    **proxy_env,
                },
            )
            duration = time.monotonic() - t0
        finally:
            if proxy is not None:
                partial = proxy.stop()
                if partial.calls > 0:
                    case_cost = partial

        self.layout.solution_capture.write(
            proc.stdout,
            proc.stderr,
            {"exit_code": proc.returncode, "duration": duration},  # get cost in here in the future
        )
        return CaseResult(
            case_id=self.case_id, exit_code=proc.returncode, duration=duration, metrics=None, cost=case_cost
        )
