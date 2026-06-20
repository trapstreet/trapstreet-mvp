from __future__ import annotations

from rich import box
from rich.console import Console
from rich.markup import escape
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from trap.models import CaseResult, ReportData
from trap.report.base import BaseRenderer


class RichRenderer(BaseRenderer):
    def __init__(self, console: Console | None = None) -> None:
        self.console = console or Console()

    @staticmethod
    def _get_metrics_keys(data: ReportData) -> set[str]:
        return {key for result in data.cases_results if result.metrics for key in result.metrics}

    @staticmethod
    def _render_metric_cell(value: object) -> str:
        if value is None:
            return "[dim]—[/dim]"
        if isinstance(value, bool):
            return "[bold green]✓[/bold green]" if value else "[bold red]✗[/bold red]"
        if isinstance(value, float) and 0.0 <= value <= 1.0:
            pct = value * 100
            if pct >= 100:
                return f"[bold green]{pct:.0f}%[/bold green]"
            if pct > 0:
                return f"[bold yellow]{pct:.0f}%[/bold yellow]"
            return f"[bold red]{pct:.0f}%[/bold red]"
        # Bracket characters in user-supplied content (judge metric values,
        # grader outputs, etc.) would otherwise be interpreted as Rich
        # markup and crash with MarkupError on mismatched tags. e.g. a judge
        # emitting a regex pattern like "[/\\-]" raises:
        #     MarkupError: closing tag '[/\\-]' doesn't match any open tag
        # Escape so brackets render as literal text.
        return escape(str(value))

    @staticmethod
    def _render_summary_value(key: str, value: object) -> str:
        if key == "cost_usd_total" and isinstance(value, float):
            return f"${value:.4f}"
        if key == "tokens_total" and isinstance(value, int):
            return f"{value:,}"
        return RichRenderer._render_metric_cell(value)

    @staticmethod
    def _render_status(result: CaseResult) -> tuple[str, str]:
        match result:
            case CaseResult(skipped=True):
                return "SKIP", "dim"
            case CaseResult(exit_code=0):
                return "PASS", "bold green"
            case _:
                return "FAIL", "bold red"

    @staticmethod
    def _render_cost(usd: float) -> str:
        if usd <= 0:
            return "[dim]—[/dim]"
        if usd < 0.001:
            return f"[dim]${usd:.5f}[/dim]"
        return f"[dim]${usd:.4f}[/dim]"

    def _build_table(self, data: ReportData) -> Table:
        metrics_keys = self._get_metrics_keys(data)
        has_cost = any(c.cost is not None for c in data.cases_results)
        table = Table(box=box.ROUNDED, show_header=True, header_style="bold", expand=True)
        table.add_column("case")
        table.add_column("status", justify="center")
        table.add_column("time", justify="right", style="dim")
        for key in metrics_keys:
            table.add_column(f"# {escape(key)}", justify="right", header_style="bold cyan")
        if has_cost:
            table.add_column("prompt_tok", justify="right", style="dim")
            table.add_column("compl_tok", justify="right", style="dim")
            table.add_column("cost", justify="right")
        for result in data.cases_results:
            label, style = self._render_status(result)
            row = [escape(result.case_id), f"[{style}]{label}[/{style}]", f"{result.duration:.3f}s"]
            for key in metrics_keys:
                value = result.metrics.get(key) if result.metrics else None
                row.append(self._render_metric_cell(value))
            if has_cost:
                if result.cost:
                    row.append(str(result.cost.prompt_tokens))
                    row.append(str(result.cost.completion_tokens))
                    row.append(self._render_cost(result.cost.cost_usd))
                else:
                    row.extend(["[dim]—[/dim]", "[dim]—[/dim]", "[dim]—[/dim]"])
            table.add_row(*row)
        return table

    def _build_summary(self, data: ReportData) -> Panel:
        s = data.summary
        n_passed = s.n_passed or 0
        n_total = s.n_total or 0
        n_skipped = s.n_skipped or 0
        n_failed = max(0, n_total - n_passed - n_skipped)
        stats = []
        if n_passed:
            stats.append(f"[bold green]{n_passed} passed[/bold green]")
        if n_failed:
            stats.append(f"[bold red]{n_failed} failed[/bold red]")
        if n_skipped:
            stats.append(f"[dim]{n_skipped} skipped[/dim]")

        rows: list[tuple[str, Text | str]] = [
            ("task", Text(data.task_name, style="bold")),
            ("result", Text.from_markup(" · ".join(stats))),
        ]
        # Render summary as a compact key/value strip — score, passed, plus
        # any well-known or extra grader-emitted keys.
        summary_dump = s.model_dump(exclude_none=True)
        # Drop counts (already shown in `result` row) to keep this terse.
        for k in ("n_passed", "n_total", "n_skipped"):
            summary_dump.pop(k, None)
        if summary_dump:
            parts = [self._render_summary_value(k, v) + f" {escape(k)}" for k, v in summary_dump.items()]
            rows.append(("summary", Text.from_markup("  ".join(parts))))

        grid = Table.grid(padding=(0, 2))
        grid.add_column(style="dim", justify="right")
        grid.add_column()
        for key, value in rows:
            grid.add_row(key, value)

        return Panel(grid, title="Summary", expand=True)

    def render(self, data: ReportData) -> None:
        self.console.print(self._build_summary(data))
        self.console.print(self._build_table(data))
