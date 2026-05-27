from __future__ import annotations

from types import TracebackType
from typing import Any

from rich.console import Console
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    SpinnerColumn,
    TaskProgressColumn,
    TextColumn,
    TimeElapsedColumn,
)
from rich.table import Column

from trap.models import CaseResult, TrapTaskCase


class CaseProgress:
    """Context manager that shows a Rich progress bar while cases run.

    Pass ``console=None`` (the default) for a silent no-op.
    """

    def __init__(self, cases: tuple[TrapTaskCase, ...], *, console: Console | None = None) -> None:
        self._n = len(cases)
        self._console = console
        self._progress: Progress | None = None
        self._task_id: Any = None

    def __enter__(self) -> CaseProgress:
        if self._console is not None:
            self._progress = Progress(
                SpinnerColumn(style="dark_orange"),
                TextColumn("[bold]{task.description}", table_column=Column(width=30, no_wrap=True)),
                BarColumn(complete_style="dark_orange", finished_style="bright_yellow"),
                TaskProgressColumn(),
                MofNCompleteColumn(),
                TimeElapsedColumn(),
                console=self._console,
                transient=True,
            )
            self._progress.start()
            self._task_id = self._progress.add_task("starting...", total=self._n)
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        if self._progress is not None:
            self._progress.stop()
            self._progress = None

    def on_case_start(self, case_id: str) -> None:
        if self._progress is not None:
            self._progress.update(self._task_id, description=f"running  [bold]{case_id}[/bold]")

    def on_case_done(self, _: CaseResult) -> None:
        if self._progress is not None:
            self._progress.advance(self._task_id)
