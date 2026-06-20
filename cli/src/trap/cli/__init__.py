from __future__ import annotations

import os
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console

from trap.auth import DEFAULT_SERVER, ApiClient, AuthStore
from trap.cli._auth import auth_app
from trap.display import CaseProgress, render_submit_result
from trap.git_ops import GitOpsError, LocalRepo
from trap.loader import TrapLoader, TraptaskLoader
from trap.report import OutputFormat, ReportHandle, renderer_factory
from trap.runner import TaskRunner

app = typer.Typer(help="AI prompt / agent / workflow / testing framework.")
app.add_typer(auth_app, name="auth")
console = Console()


def _die(msg: object) -> typer.Exit:
    """Print an error and return an Exit(2) to raise."""
    console.print(f"[red]error[/red]: {msg}")
    return typer.Exit(code=2)


@app.command()
def run(
    task: Annotated[str | None, typer.Argument()] = None,
    solution: Annotated[
        str | None,
        typer.Option("--solution", help="Solution to run: a local path or a git+ URL (default: cwd)."),
    ] = None,
    clone_to: Annotated[
        Path | None,
        typer.Option("--clone-to", help="Where to clone a git+ URL --solution (default: ./<repo>)."),
    ] = None,
    tags: Annotated[list[str] | None, typer.Option("--tag", "-t")] = None,
    output: Annotated[OutputFormat, typer.Option("--output", "-o")] = OutputFormat.rich,
    fail_fast: Annotated[bool, typer.Option("--fail-fast")] = False,
    setup: Annotated[
        bool,
        typer.Option(
            "--setup",
            help="Force-run the task's setup_cmd even when no remote pull brought new code.",
        ),
    ] = False,
    workspace: Annotated[Path, typer.Option("--workspace", "-w")] = Path(".trap"),
) -> None:
    """Run a task against a solution.

    --solution is the solution to run: a local path, or a git+ URL to clone
    into ./<repo> (or --clone-to). Omit it to use the trap.yaml in the cwd.
    """
    try:
        trap_yaml_loader = TrapLoader.from_solution(
            solution,
            clone_to,
            allow_remote=True,
            progress_func=(
                (lambda m: console.print(f"[dim]{m}[/dim]")) if output == OutputFormat.rich else None
            ),
        )
        task_obj = trap_yaml_loader.resolve_task(task)
        traptask_yaml_loader = TraptaskLoader.from_task(task_obj, trap_yaml_loader.trap_dir, setup=setup)
    except (GitOpsError, subprocess.CalledProcessError) as e:
        raise _die(e) from None

    active_cases = traptask_yaml_loader.cases_with_tags(tags or [])

    started_at_local = datetime.now()
    ts = started_at_local.isoformat(timespec="seconds")
    report_handle = ReportHandle(workspace.resolve(), task_obj.name, ts)

    runner = TaskRunner(
        task_obj=task_obj,
        trap_config=trap_yaml_loader.config,
        trap_dir=trap_yaml_loader.trap_dir,
        traptask_config=traptask_yaml_loader.traptask,
        traptask_dir=traptask_yaml_loader.traptask_dir,
        run_dir=report_handle.run_dir,
    )
    prog_console = console if output == OutputFormat.rich else None
    with CaseProgress(active_cases, console=prog_console) as prog:
        case_results, grader_metrics = runner.run(
            active_cases,
            fail_fast=fail_fast,
            on_case_start=prog.on_case_start,
            on_case_done=prog.on_case_done,
        )
    finished_at_utc = datetime.now(UTC)

    # Record git provenance (repo + commit) of the solution checkout so the
    # report is reproducible. Only set for a clean git checkout with a remote;
    # the trap.yaml metadata: block overrides any auto-detected key.
    auto_metadata = LocalRepo.provenance_of(trap_yaml_loader.trap_dir)

    report_data = report_handle.save(
        cases=case_results,
        task=task_obj,
        trap_config=trap_yaml_loader.config,
        started_at_utc=started_at_local.astimezone(UTC),
        finished_at_utc=finished_at_utc,
        grader_metrics=grader_metrics,
        auto_metadata=auto_metadata,
    )
    renderer_factory(output).render(report_data)

    case_failed = any(cr.exit_code != 0 for cr in case_results)
    raise typer.Exit(code=case_failed)


@app.command()
def report(
    task: Annotated[str | None, typer.Argument()] = None,
    run: Annotated[str, typer.Argument()] = "latest",
    solution: Annotated[
        str | None,
        typer.Option("--solution", help="Local solution path holding trap.yaml (default: cwd)."),
    ] = None,
    output: Annotated[OutputFormat, typer.Option("--output", "-o")] = OutputFormat.rich,
    workspace: Annotated[Path, typer.Option("--workspace", "-w")] = Path(".trap"),
) -> None:
    """Display a report for a task (defaults to latest run)."""
    try:
        task_name = TrapLoader.from_solution(solution).resolve_task(task).name
    except GitOpsError as e:
        raise _die(e) from None
    report_data = ReportHandle(workspace.resolve(), task_name, run).load()
    renderer_factory(output).render(report_data)


@app.command()
def submit(
    task: Annotated[
        str | None,
        typer.Argument(
            help="Task name (defaults to first task in trap.yaml). "
            "Used as both the local run dir and the trapstreet task_id.",
        ),
    ] = None,
    solution: Annotated[
        str | None,
        typer.Option("--solution", help="Local solution path holding trap.yaml (default: cwd)."),
    ] = None,
    workspace: Annotated[Path, typer.Option("--workspace", "-w")] = Path(".trap"),
    run: Annotated[str, typer.Option("--run", "-r", help="Which run to upload.")] = "latest",
    report: Annotated[
        Path | None,
        typer.Option(
            "--report",
            help=(
                "Submit this report.json file directly, skipping trap.yaml + "
                "workspace resolution. Used by skills / external runners that "
                "produced a report outside the normal `tp run` workflow. "
                "Requires the task argument (we can't infer it without trap.yaml)."
            ),
        ),
    ] = None,
) -> None:
    """Upload a report.json to trapstreet.

    Default mode: read from the .trap/<task>/<run>/report.json workspace that
    `tp run` populated. Pass `--report <path>` to upload an arbitrary
    report.json instead — handy for Claude Code skills and external runners
    that build the wire format themselves.
    """
    stored = AuthStore().load()
    # priority: TRAPSTREET_URL env > stored > default
    resolved_server = (
        os.environ.get("TRAPSTREET_URL") or (stored.server if stored else None) or DEFAULT_SERVER
    )
    # priority: TRAPSTREET_API_KEY env > stored
    resolved_key = os.environ.get("TRAPSTREET_API_KEY") or (stored.api_key if stored else None)
    if not resolved_key:
        console.print(
            "[red]not logged in[/red]. Run [bold]tp auth login[/bold] or set [bold]TRAPSTREET_API_KEY[/bold]."
        )
        raise typer.Exit(code=2)

    # Two paths: direct `--report` (skip workspace) vs default workspace lookup.
    if report is not None:
        if not task:
            console.print(
                "[red]error[/red]: passing [bold]--report[/bold] requires the "
                "task argument (no trap.yaml to infer it from)."
            )
            raise typer.Exit(code=2)
        if not report.exists():
            console.print(f"[red]error[/red]: no file at {report}")
            raise typer.Exit(code=2)
        task_name = task
        report_path = report
    else:
        try:
            task_name = TrapLoader.from_solution(solution).resolve_task(task).name
        except GitOpsError as e:
            raise _die(e) from None
        report_handle = ReportHandle(workspace.resolve(), task_name, run)
        try:
            report_handle.assert_exists()
        except FileNotFoundError:
            console.print(
                f"[red]error[/red]: no report at {report_handle.report_json_path}. "
                "Run [bold]tp run[/bold] first."
            )
            raise typer.Exit(code=2) from None
        report_path = report_handle.report_json_path

    client = ApiClient(resolved_server, resolved_key)
    resp_data = client.submit(task_name, report_path)
    render_submit_result(resp_data)


@app.command()
def init() -> None:
    """Generate annotated trap.yaml + traptask.yaml scaffold."""
    console.print("not yet")
