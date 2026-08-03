"""
Session-aware context injection for MCP tools.

Tracks MCP sessions and injects effective policies + objectives into the
first tool response per session. Uses a contextvars-based approach to
pass the API key from the HTTP layer into MCP tool functions.
"""

import contextvars
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger("skillcanon.mcp.session")

# ContextVar set by the ASGI middleware, read by tool functions.
_current_api_key: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "_current_api_key", default=None
)


def get_current_api_key() -> str | None:
    """Return the API key from the current request context, or None."""
    return _current_api_key.get()


@dataclass
class SessionState:
    """Tracks per-session state for context injection."""

    user_id: uuid.UUID | None = None
    context_delivered: bool = False
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class SessionManager:
    """In-memory session tracker keyed by MCP session object identity."""

    def __init__(self) -> None:
        self._sessions: dict[int, SessionState] = {}

    def get_or_create(self, session_key: int) -> SessionState:
        if session_key not in self._sessions:
            self._sessions[session_key] = SessionState()
        return self._sessions[session_key]

    def remove(self, session_key: int) -> None:
        self._sessions.pop(session_key, None)

    def cleanup_stale(self, max_age_hours: int = 24) -> int:
        """Remove sessions older than max_age_hours. Returns count removed."""
        now = datetime.now(timezone.utc)
        stale = [
            k
            for k, v in self._sessions.items()
            if (now - v.created_at).total_seconds() > max_age_hours * 3600
        ]
        for k in stale:
            del self._sessions[k]
        return len(stale)

    @property
    def active_count(self) -> int:
        return len(self._sessions)


# Singleton used by tools.py
session_manager = SessionManager()


class ApiKeyMiddleware:
    """ASGI middleware that extracts the Authorization header and stores
    the API key in a contextvars.ContextVar for downstream MCP tools."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        api_key: str | None = None
        headers = dict(scope.get("headers", []))
        auth_value = headers.get(b"authorization", b"").decode()
        if auth_value.startswith("Bearer ") and auth_value[7:].startswith("sh_"):
            api_key = auth_value[7:]

        token = _current_api_key.set(api_key)
        try:
            await self.app(scope, receive, send)
        finally:
            _current_api_key.reset(token)
