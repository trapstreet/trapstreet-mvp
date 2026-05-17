from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from trap.models import CaseResult, ReportData, Task

_REPORT_FILENAME = "report.json"


class ReportSaver:
    @staticmethod
    def save(
        run_dir: Path,
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
        (run_dir / _REPORT_FILENAME).write_text(data.model_dump_json(indent=2))
        return data

    @staticmethod
    def load(run_dir: Path) -> ReportData:
        report_path = run_dir / _REPORT_FILENAME
        if not report_path.exists():
            raise FileNotFoundError(f"no report found in {run_dir}")
        return ReportData.model_validate_json(report_path.read_text())
