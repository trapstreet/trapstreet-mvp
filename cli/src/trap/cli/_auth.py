from __future__ import annotations

import sys
from typing import Annotated

import typer
from rich.console import Console

from trap.auth import DEFAULT_SERVER, ApiClient, AuthStore, BrowserProvider, TokenProvider

auth_app = typer.Typer(help="Manage authentication.")
console = Console()


@auth_app.command("login")
def auth_login(
    server: Annotated[
        str | None,
        typer.Option("--server", envvar="TRAPSTREET_URL", help="Trapstreet server URL."),
    ] = None,
    timeout: Annotated[int, typer.Option("--timeout", help="Seconds to wait for browser approval.")] = 300,
    with_token: Annotated[
        bool,
        typer.Option("--with-token", help="Read api_key from stdin instead of opening a browser."),
    ] = False,
) -> None:
    """Authenticate this machine with Trapstreet.

    By default opens a browser to complete OAuth. Pass --with-token to supply
    an api_key directly (useful for CI or headless environments).

    The token is saved to ~/.config/trapstreet/auth.json (mode 600).
    """
    stored = AuthStore().load()
    # priority: --server / TRAPSTREET_URL > stored > default
    resolved_server = server or (stored.server if stored else None) or DEFAULT_SERVER

    if with_token:
        if sys.stdin.isatty():
            token = typer.prompt("API key", hide_input=True)
        else:
            token = sys.stdin.read().strip()
        provider = TokenProvider(resolved_server, token)
    else:
        if server and server != DEFAULT_SERVER:
            console.print(
                f"[red]error[/red]: browser login is only supported on {DEFAULT_SERVER}. "
                "Use --with-token for custom servers."
            )
            raise typer.Exit(code=2)
        provider = BrowserProvider(resolved_server, timeout)

    console.print(provider.pre_message)
    try:
        auth_data = provider.acquire()
    except (ValueError, TimeoutError) as e:
        console.print(f"[red]error[/red]: {e}")
        raise typer.Exit(code=2) from None

    path = AuthStore().save(auth_data)
    console.print(
        "[green]✓ logged in[/green]"
        + (f" · solution [bold]{auth_data.solution}[/bold]" if auth_data.solution else "")
        + f" · token saved to {path}"
    )


@auth_app.command("logout")
def auth_logout() -> None:
    """Delete the locally-stored api_key."""
    auth_store = AuthStore()
    if not auth_store.exists:
        console.print(f"already logged out — no file at {auth_store.PATH}")
        return
    auth_store.delete()
    console.print(f"[green]✓[/green] removed {auth_store.PATH}")


@auth_app.command("status")
def auth_status(
    verify: Annotated[
        bool,
        typer.Option("--verify/--no-verify", help="Ping server to verify token validity."),
    ] = True,
) -> None:
    """Show current authentication state."""
    stored = AuthStore().load()
    if not stored:
        console.print("[red]not logged in[/red]. Run [bold]tp auth login[/bold].")
        raise typer.Exit(code=1)

    console.print(f"  server    {stored.server}")
    if stored.solution:
        console.print(f"  solution  [bold]{stored.solution}[/bold]")

    if not verify:
        return

    client = ApiClient(stored.server, stored.api_key)
    me = client.get_me()
    user = me.get("user") or {}
    identity = user.get("name") or user.get("email") or "(unknown)"
    console.print(f"  user      {identity}\n[green]✓ token is valid[/green]")
