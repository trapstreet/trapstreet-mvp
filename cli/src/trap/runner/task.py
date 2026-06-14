from __future__ import annotations

from collections.abc import Callable, Iterable, Iterator
from datetime import datetime
from pathlib import Path
from typing import Any

from trap.models import CaseResult, Task, TrapTask, TrapTaskCase
from trap.runner.case import CaseRunner
from trap.runner.grader import GraderRunner
from trap.runner.judge import JudgeRunner
from trap.runner.layout import CaseLayout


class TaskRunner:
    def __init__(
        self,
        task_obj: Task,
        trap_dir: Path,
        traptask_dir: Path,
        traptask_obj: TrapTask,
        run_dir: Path,
    ) -> None:
        self.task = task_obj
        self.trap_dir = trap_dir
        self.traptask_obj = traptask_obj
        self.traptask_dir = traptask_dir
        self.run_dir = run_dir

        self.task_inputs_dir = (traptask_dir / traptask_obj.dirs.inputs).resolve()
        self.task_expected_dir = (traptask_dir / traptask_obj.dirs.expected).resolve()

    def _update_latest(self) -> None:
        latest = self.run_dir.parent / "latest"
        if latest.is_symlink():
            latest.unlink()
        elif latest.exists():
            # Path exists but isn't a symlink — likely an interrupted prior run
            # or a sync tool that materialized the symlink as a real directory.
            # Move it aside (non-destructive) so subsequent runs self-heal.
            suffix = datetime.now().isoformat(timespec="microseconds")
            latest.rename(latest.with_name(f"latest.broken.{suffix}"))
        latest.symlink_to(self.run_dir.name)

    def _iter(
        self,
        cases: Iterable[TrapTaskCase],
        *,
        fail_fast: bool = False,
        on_case_start: Callable[[str], None] | None = None,
        on_case_done: Callable[[CaseResult], None] | None = None,
    ) -> Iterator[CaseResult]:
        # TODO: parallelize case runs, but judge cases sequentially in the same order as case runs
        for case in cases:
            if on_case_start is not None:
                on_case_start(case.id)
            layout = CaseLayout.for_case(self.run_dir, case.id)
            result = CaseRunner(self, case.id, layout).run()
            if self.traptask_obj.judge is not None:
                metrics = JudgeRunner(self, case.id, layout).run()
                result = result.model_copy(update={"metrics": metrics})
            if on_case_done is not None:
                on_case_done(result)
            yield result
            if fail_fast and result.exit_code != 0:
                break

    def run(
        self,
        cases: Iterable[TrapTaskCase],
        *,
        fail_fast: bool = False,
        on_case_start: Callable[[str], None] | None = None,
        on_case_done: Callable[[CaseResult], None] | None = None,
    ) -> tuple[tuple[CaseResult, ...], Any]:

        case_results = tuple(
            self._iter(cases, fail_fast=fail_fast, on_case_start=on_case_start, on_case_done=on_case_done)
        )

        grader_metrics = None
        if self.traptask_obj.grader is not None:
            grader_metrics = GraderRunner(self, case_results).run()

        self._update_latest()
        return case_results, grader_metrics
