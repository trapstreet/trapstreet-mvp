from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from trap.models import CaseResult, ReportData, Task

_REPORT_FILENAME = "report.json"


class ReportHandle:
    def __init__(self, workspace: Path, task_name: str, run: str) -> None:
        self._workspace = workspace
        self._task_name = task_name
        self._run = run

    @property
    def run_dir(self) -> Path:
        return self._workspace / self._task_name / self._run

    @property
    def report_json_path(self) -> Path:
        return self.run_dir / _REPORT_FILENAME

    def save(
        self,
        cases: tuple[CaseResult, ...],
        task: Task,
        started_at: datetime,
        finished_at: datetime,
        grader_metrics: Any = None,
        auto_metadata: dict[str, Any] | None = None,
    ) -> ReportData:
        data = ReportData.from_run(
            task=task,
            cases=cases,
            started_at=started_at,
            finished_at=finished_at,
            grader_metrics=grader_metrics,
            auto_metadata=auto_metadata,
        )
        self.report_json_path.write_text(data.model_dump_json(indent=2))
        return data

    def assert_exists(self) -> None:
        if not self.report_json_path.exists():
            raise FileNotFoundError(f"no report found in {self.run_dir}")

    def load(self) -> ReportData:
        self.assert_exists()
        return ReportData.model_validate_json(self.report_json_path.read_text())
