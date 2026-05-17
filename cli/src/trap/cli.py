from __future__ import annotations

import http.server
import json as _json
import os
import socket
import socketserver
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Any

import typer
from rich.console import Console

from trap.git_meta import detect_metadata
from trap.loader import TrapLoader, TrapTaskLoader
from trap.report import OutputFormat, ReportSaver, renderer_factory
from trap.runner import TaskRunner

app = typer.Typer(help="AI prompt / agent / workflow / testing framework.")
console = Console()

AUTH_FILE = Path.home() / ".config" / "trapstreet" / "auth.json"
DEFAULT_SERVER = "https://trapstreet.run"


# -----------------------------------------------------------------------------
# auth helpers


def _load_auth_file() -> dict[str, str]:
    """Read ~/.config/trapstreet/auth.json or return empty dict."""
    if not AUTH_FILE.exists():
        return {}
    try:
        return _json.loads(AUTH_FILE.read_text())
    except (OSError, _json.JSONDecodeError):
        return {}


def _save_auth_file(server: str, api_key: str, runner: str | None) -> Path:
    AUTH_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {"server": server, "api_key": api_key}
    if runner:
        payload["runner"] = runner
    AUTH_FILE.write_text(_json.dumps(payload, indent=2) + "\n")
    AUTH_FILE.chmod(0o600)
    return AUTH_FILE


def _resolve_api_key(flag_or_env: str | None) -> str:
    """Auth precedence: --api-key / TRAPSTREET_API_KEY > auth.json > error."""
    if flag_or_env:
        return flag_or_env
    api_key = _load_auth_file().get("api_key")
    if api_key:
        return api_key
    console.print(
        "[red]not logged in[/red]. Run [bold]tp login[/bold] "
        "or set [bold]TRAPSTREET_API_KEY[/bold] / pass [bold]--api-key[/bold]."
    )
    raise SystemExit(2)


# -----------------------------------------------------------------------------
# commands


@app.command()
def run(
    task: str | None = typer.Argument(None),
    trap_yaml_path: Path = typer.Option(Path("trap.yaml"), "--config", "-c"),
    tags: list[str] = typer.Option([], "--tag", "-t"),
    output: OutputFormat = typer.Option(OutputFormat.rich, "--output", "-o"),
    fail_fast: bool = typer.Option(False, "--fail-fast"),
    workspace: Path = typer.Option(Path(".trap"), "--workspace", "-w"),
) -> None:
    """Run a task against a solution."""
    trap_yaml_loader = TrapLoader(trap_yaml_path)
    task_obj = trap_yaml_loader.resolve_task(task)

    task_yaml_loader = TrapTaskLoader.from_task(task_obj, trap_yaml_loader.trap_dir)
    active_cases = task_yaml_loader.cases_with_tags(tags)

    started_at = datetime.now()
    ts = started_at.isoformat(timespec="seconds")
    trap_run_dir = workspace.resolve() / task_obj.name / ts

    runner = TaskRunner(
        task_obj=task_obj,
        trap_dir=trap_yaml_loader.trap_dir,
        traptask_obj=task_yaml_loader.traptask,
        traptask_dir=task_yaml_loader.task_dir,
        task_outputs_dir=trap_run_dir,
    )
    case_results, grader_metrics = runner.run(active_cases, fail_fast=fail_fast)
    finished_at = datetime.now()

    # Sniff the solution dir for a git remote so the leaderboard row
    # gets a "↗ source" link automatically. trap.yaml metadata: block
    # overrides any auto-detected key.
    auto_metadata = detect_metadata(trap_yaml_loader.trap_dir)

    report_data = ReportSaver.save(
        run_dir=trap_run_dir,
        cases=case_results,
        task=task_obj,
        started_at=started_at,
        finished_at=finished_at,
        grader_metrics=grader_metrics,
        auto_metadata=auto_metadata,
    )
    renderer_factory(output).render(report_data)

    case_failed = any(cr.exit_code != 0 for cr in case_results)
    raise SystemExit(case_failed)


@app.command()
def report(
    task: str | None = typer.Argument(None),
    run: str = typer.Argument("latest"),
    trap_yaml_path: Path = typer.Option(Path("trap.yaml"), "--config", "-c"),
    output: OutputFormat = typer.Option(OutputFormat.rich, "--output", "-o"),
    workspace: Path = typer.Option(Path(".trap"), "--workspace", "-w"),
) -> None:
    """Display a report for a task (defaults to latest run)."""
    trap_yaml_loader = TrapLoader(trap_yaml_path)
    task_name = trap_yaml_loader.resolve_task(task).name
    run_dir = workspace.resolve() / task_name / run
    report_data = ReportSaver.load(run_dir)
    renderer_factory(output).render(report_data)


@app.command()
def login(
    server: str = typer.Option(
        DEFAULT_SERVER,
        "--server",
        envvar="TRAPSTREET_URL",
        help="Trapstreet server URL.",
    ),
    timeout: int = typer.Option(300, "--timeout", help="Seconds to wait for browser approval."),
) -> None:
    """Open the browser to authorize this machine; save api_key locally.

    Starts a temporary HTTP server on localhost, opens
    <server>/cli/authorize?return=http://localhost:<port>/callback in your
    browser, and waits for the redirect back with the api_key.

    The token is saved to ~/.config/trapstreet/auth.json (mode 600).
    Subsequent `tp submit` calls read from there automatically — no env
    var needed (but TRAPSTREET_API_KEY still works as an override).
    """
    # Bind to an arbitrary free port on the loopback interface.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]

    captured: dict[str, str] = {}

    class _CallbackHandler(http.server.BaseHTTPRequestHandler):
        # Silence default access log
        def log_message(self, format: str, *args: Any) -> None:
            return

        def do_GET(self) -> None:
            qs = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(qs)
            api_key = (params.get("api_key") or [None])[0]
            runner_name = (params.get("runner") or [None])[0]

            if api_key:
                captured["api_key"] = api_key
                if runner_name:
                    captured["runner"] = runner_name
                self.send_response(200)
                self.send_header("content-type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    b"<!doctype html><meta charset=utf-8>"
                    b"<title>logged in</title>"
                    b"<style>body{font-family:ui-monospace,monospace;"
                    b"background:#0a0a0a;color:#ededed;padding:3em;}"
                    b"h1{color:#ff5f1f}</style>"
                    b"<h1>logged in</h1>"
                    b"<p>You can close this tab.</p>"
                )
            else:
                self.send_response(400)
                self.send_header("content-type", "text/plain")
                self.end_headers()
                self.wfile.write(b"missing api_key in query string")

    server_obj = socketserver.TCPServer(("127.0.0.1", port), _CallbackHandler)
    thread = threading.Thread(target=server_obj.serve_forever, daemon=True)
    thread.start()

    return_url = f"http://localhost:{port}/callback"
    auth_url = f"{server.rstrip('/')}/cli/authorize?return={urllib.parse.quote(return_url, safe='')}"

    console.print(f"opening [link={auth_url}]{auth_url}[/link]")
    try:
        webbrowser.open(auth_url)
    except Exception:
        # Couldn't open; user can copy/paste
        console.print(
            "[yellow]could not open browser automatically — copy the URL above into a browser[/yellow]"
        )

    deadline = time.time() + timeout
    while time.time() < deadline and "api_key" not in captured:
        time.sleep(0.2)

    server_obj.shutdown()
    server_obj.server_close()

    if "api_key" not in captured:
        console.print(f"[red]timed out after {timeout}s[/red] waiting for browser approval")
        raise SystemExit(2)

    path = _save_auth_file(server, captured["api_key"], captured.get("runner"))
    runner_hint = f" · runner [bold]{captured.get('runner')}[/bold]" if captured.get("runner") else ""
    console.print(f"[green]✓ logged in[/green]{runner_hint} · token saved to {path}")


@app.command()
def logout() -> None:
    """Delete the locally-stored api_key."""
    if AUTH_FILE.exists():
        AUTH_FILE.unlink()
        console.print(f"[green]✓[/green] removed {AUTH_FILE}")
    else:
        console.print(f"already logged out — no file at {AUTH_FILE}")


@app.command()
def submit(
    task: str | None = typer.Argument(
        None,
        help="Task name (defaults to first task in trap.yaml). "
        "Used as both the local run dir and the trapstreet task_id.",
    ),
    trap_yaml_path: Path = typer.Option(Path("trap.yaml"), "--config", "-c"),
    workspace: Path = typer.Option(Path(".trap"), "--workspace", "-w"),
    run: str = typer.Option("latest", "--run", "-r", help="Which run to upload (default: latest)."),
    server: str = typer.Option(
        DEFAULT_SERVER,
        "--server",
        envvar="TRAPSTREET_URL",
        help="Trapstreet server URL.",
    ),
    api_key: str | None = typer.Option(
        None,
        "--api-key",
        envvar="TRAPSTREET_API_KEY",
        help="Runner api_key. Falls back to TRAPSTREET_API_KEY env, "
        "then ~/.config/trapstreet/auth.json (see `tp login`).",
    ),
) -> None:
    """Upload the latest report.json to trapstreet."""
    # Resolve api_key from flag > env > auth.json > error.
    api_key = _resolve_api_key(api_key)

    # If --server wasn't overridden but auth.json has one, prefer file's server.
    if server == DEFAULT_SERVER and not os.environ.get("TRAPSTREET_URL"):
        file_server = _load_auth_file().get("server")
        if file_server:
            server = file_server

    trap_yaml_loader = TrapLoader(trap_yaml_path)
    task_name = trap_yaml_loader.resolve_task(task).name

    report_path = workspace.resolve() / task_name / run / "report.json"
    if not report_path.exists():
        console.print(f"[red]error[/red]: no report at {report_path}. Run [bold]tp run[/bold] first.")
        raise SystemExit(2)

    payload = report_path.read_bytes()
    url = f"{server.rstrip('/')}/api/submit/{task_name}"
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "authorization": f"Bearer {api_key}",
            "content-type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body: Any = _json.loads(resp.read())
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", errors="replace")
        console.print(f"[red]http {e.code}[/red]: {msg}")
        raise SystemExit(2) from None
    except urllib.error.URLError as e:
        console.print(f"[red]connection error[/red]: {e.reason}")
        raise SystemExit(2) from None

    run_obj = body.get("run") or {}
    run_id = run_obj.get("id", "?")
    score = run_obj.get("total_score")
    passed = run_obj.get("passed")
    view_url = body.get("view_url", "")
    status = "[green]✓ passed[/green]" if passed else "[red]✗ failed[/red]"
    console.print(f"{status} [bold]{run_id}[/bold] · score [cyan]{score}[/cyan]")
    if view_url:
        console.print(f"  → [link={view_url}]{view_url}[/link]")


@app.command()
def init() -> None:
    """Generate annotated trap.yaml + traptask.yaml scaffold."""
    console.print("not yet")
