# Wire format for what `tp` writes to .trap/<task>/<ts>/report.json
# and POSTs to the trapstreet `/api/submit/:task_id` endpoint.
#
# Reference: trapstreet/docs/scoring-and-metrics.md "Upload protocol".
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from trap.models.provenance import Provenance
from trap.models.results import CaseResult
from trap.models.trap_yaml import Profile, TrapConfig


class ReportData(BaseModel):
    """Top-level upload protocol envelope."""

    cases_results: tuple[CaseResult, ...]
    started_at: str
    finished_at: str
    # Raw run-level grader output; None when no grader is configured.
    grader_metrics: Any
    # Engine identity (model/framework). Self-reported from trap.yaml today, but the
    # website consumes it from the report — never from trap.yaml directly — precisely
    # because the source may change: a future version is expected to derive this by
    # observing actual usage (e.g. the cost proxy) rather than trusting self-report.
    # Routing it through the report keeps that swap invisible to downstream consumers.
    profile: Profile = Field(default_factory=Profile)
    # The (repo, commit) of both checkouts — the minimal seed to reproduce the run.
    provenance: Provenance = Field(default_factory=Provenance)

    @classmethod
    def from_run(
        cls,
        trap_config: TrapConfig,
        cases_results: tuple[CaseResult, ...],
        started_at_utc: datetime,
        finished_at_utc: datetime,
        grader_metrics: Any,
        provenance: Provenance | None = None,
    ) -> ReportData:
        return cls(
            cases_results=cases_results,
            started_at=started_at_utc.isoformat(timespec="seconds"),
            finished_at=finished_at_utc.isoformat(timespec="seconds"),
            grader_metrics=grader_metrics,
            profile=trap_config.profile,
            provenance=provenance or Provenance(),
        )
