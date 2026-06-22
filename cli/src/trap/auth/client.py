from __future__ import annotations

from functools import cached_property
from pathlib import Path
from typing import Any

import requests
import typer


class ApiClient:
    """Authenticated HTTP client for the trapstreet API."""

    def __init__(self, server: str, api_key: str, timeout: int = 30) -> None:
        self._server = server.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout

    @cached_property
    def _session(self) -> requests.Session:
        session = requests.Session()
        session.headers.update(
            {
                "authorization": f"Bearer {self._api_key}",
                "content-type": "application/json",
            }
        )
        return session

    def get_me(self) -> dict[str, Any]:
        try:
            resp = self._session.get(f"{self._server}/api/me", timeout=10)
            resp.raise_for_status()
            return resp.json()
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 401:
                typer.echo("token is invalid", err=True)
            else:
                status = e.response.status_code if e.response is not None else "?"
                typer.echo(f"server error ({status})", err=True)
            raise typer.Exit(code=1) from None
        except requests.ConnectionError:
            typer.echo("server unreachable", err=True)
            raise typer.Exit(code=1) from None

    # TODO: client do NOT have task_id
    def submit(self, task_id: str, report_path: Path) -> dict[str, Any]:
        url = f"{self._server}/api/submit/{task_id}"
        try:
            resp = self._session.post(
                url,
                data=report_path.read_bytes(),
                timeout=self._timeout,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.HTTPError as e:
            msg = f"http {e.response.status_code}: {e.response.text}" if e.response is not None else str(e)
            typer.echo(msg, err=True)
            raise typer.Exit(code=1) from None
        except requests.ConnectionError as e:
            typer.echo(f"connection error: {e}", err=True)
            raise typer.Exit(code=1) from None
