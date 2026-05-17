# Wire format for what `tp` writes to .trap/<task>/<ts>/report.json
# and POSTs to the trapstreet `/api/submit/:task_id` endpoint.
#
# Reference: trapstreet/docs/scoring-and-metrics.md "Upload protocol".
from __future__ import annotations

from datetime import UTC, datetime
from statistics import median
from typing import Any

from pydantic import BaseModel, ConfigDict

from trap.models.config import Task
from trap.models.results import CaseResult


class Summary(BaseModel):
    """Run-level scoring summary. From grader.py's stdout, OR auto-computed
    from case metrics when grader.py is absent.

    `passed` and `score` are required (the headline). The rest are
    well-known optional keys the trapstreet leaderboard recognises;
    grader.py may emit any additional keys, which are tolerated and
    flow through to the run detail page.
    """

    model_config = ConfigDict(extra="allow")

    passed: bool
    score: float
    n_passed: int | None = None
    n_total: int | None = None
    n_skipped: int | None = None
    latency_ms_total: int | None = None
    latency_ms_median: int | None = None
    latency_ms_p95: int | None = None
    cost_usd_total: float | None = None
    tokens_total: int | None = None
    by_category: dict[str, float] | None = None


class ReportData(BaseModel):
    """5 top-level keys, matching the upload protocol."""

    task_id: str
    cases: tuple[CaseResult, ...]
    summary: Summary
    started_at: str
    finished_at: str
    metadata: dict[str, Any] = {}

    @classmethod
    def from_run(
        cls,
        task: Task,
        cases: tuple[CaseResult, ...],
        started_at: datetime,
        finished_at: datetime,
        grader_metrics: Any = None,
        auto_metadata: dict[str, Any] | None = None,
    ) -> ReportData:
        summary = _coerce_or_auto_summary(grader_metrics, cases)
        # auto_metadata is computed by the CLI (currently: git remote URL).
        # User-set keys in trap.yaml's metadata: block always win.
        merged = {
            **(auto_metadata or {}),
            **(dict(task.metadata) if task.metadata else {}),
        }
        return cls(
            task_id=task.name,
            cases=cases,
            summary=summary,
            started_at=_iso(started_at),
            finished_at=_iso(finished_at),
            metadata=merged,
        )


# -- internals ----------------------------------------------------------------


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.isoformat(timespec="seconds")


def _coerce_or_auto_summary(grader_metrics: Any, cases: tuple[CaseResult, ...]) -> Summary:
    """Normalise grader.py output to Summary, backfilling well-known fields
    from cases when the grader didn't compute them. If grader_metrics is
    None (no grader.py configured), compute everything from cases.
    """
    if isinstance(grader_metrics, dict):
        filled = dict(grader_metrics)
        auto = _auto_summary_dict(cases)
        for k, v in auto.items():
            filled.setdefault(k, v)
        # Graders commonly emit latency as rounded floats (e.g. 83.8 ms).
        # Summary contracts these fields as ints — coerce here so we don't
        # crash on otherwise-valid grader output.
        for key in ("latency_ms_total", "latency_ms_median", "latency_ms_p95"):
            v = filled.get(key)
            if isinstance(v, float):
                filled[key] = int(round(v))
        return Summary.model_validate(filled)
    return Summary.model_validate(_auto_summary_dict(cases))


def _auto_summary_dict(cases: tuple[CaseResult, ...]) -> dict[str, Any]:
    scored = [c for c in cases if not c.skipped]
    n_skipped = len(cases) - len(scored)
    scores: list[float] = []
    durations_ms: list[int] = []
    costs: list[float] = []
    for c in scored:
        m = c.metrics if isinstance(c.metrics, dict) else {}
        s = m.get("score")
        if isinstance(s, (int, float)):
            scores.append(float(s))
        if c.duration is not None:
            durations_ms.append(round(c.duration * 1000))
        cost = m.get("usd_cost")
        if isinstance(cost, (int, float)):
            costs.append(float(cost))

    avg = sum(scores) / len(scores) if scores else 0.0
    n_passed = sum(1 for s in scores if s == 1.0)
    n_total = len(scored)
    out: dict[str, Any] = {
        "passed": avg >= 0.8,
        "score": round(avg, 4),
        "n_passed": n_passed,
        "n_total": n_total,
        "n_skipped": n_skipped,
    }
    if durations_ms:
        out["latency_ms_total"] = sum(durations_ms)
        out["latency_ms_median"] = int(median(durations_ms))
        if len(durations_ms) > 1:
            sorted_d = sorted(durations_ms)
            out["latency_ms_p95"] = sorted_d[int(0.95 * (len(sorted_d) - 1))]
    if costs:
        out["cost_usd_total"] = round(sum(costs), 6)
    return out
