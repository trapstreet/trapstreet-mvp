# Wire format for what `tp` writes to .trap/<task>/<ts>/report.json
# and POSTs to the trapstreet `/api/submit/:task_id` endpoint.
#
# Reference: trapstreet/docs/scoring-and-metrics.md "Upload protocol".
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel

from trap.models.results import CaseResult
from trap.models.trap_yaml import Task, TrapConfig


class ReportData(BaseModel):
    """Top-level upload protocol envelope."""

    task_name: str
    cases_results: tuple[CaseResult, ...]
    started_at: str
    finished_at: str
    metadata: dict[str, Any] = {}
    # Solution identity for this submission. None → server auto-assigns
    # a serial name like `<user-slug>-<n>`. Set → server creates/reuses
    # a solution with this name under the authenticated user.
    solution: str | None = None

    @classmethod
    def from_run(
        cls,
        task: Task,
        trap_config: TrapConfig,
        cases_results: tuple[CaseResult, ...],
        started_at_utc: datetime,
        finished_at_utc: datetime,
        grader_metrics: Any,
        auto_metadata: dict[str, Any] | None = None,
    ) -> ReportData:
        merged = {
            **(auto_metadata or {}),
            **(dict(trap_config.metadata) if trap_config.metadata else {}),
        }
        return cls(
            task_name=task.name,
            cases_results=cases_results,
            started_at=started_at_utc.isoformat(timespec="seconds"),
            finished_at=finished_at_utc.isoformat(timespec="seconds"),
            metadata=merged,
            solution=trap_config.name,
        )
