"""Regression tests for RemoteAccessAuthMiddleware.

Written during the 10/08/2026 security review. The API had no authentication on
23 of its 24 routers while reaching the Fernet credential vault, the playbook
runner and the Docker stack builder. The desktop frontend cannot present a
credential (``fetchJSON`` sends only ``Content-Type``) and no key is provisioned
on first run, so requiring auth everywhere would have locked the user out of
their own application.

The boundary is therefore drawn at the caller's address: loopback is the desktop
app and passes through; anything off-box must authenticate. These tests pin both
halves of that, because the failure mode of getting it wrong in either direction
is severe — an outage on one side, an unauthenticated credential vault on the
other.
"""

import asyncio

import pytest
from fastapi import FastAPI

from ignition_toolkit.auth.middleware import RemoteAccessAuthMiddleware


@pytest.fixture
def app_with_middleware():
    app = FastAPI()
    app.add_middleware(RemoteAccessAuthMiddleware)

    @app.get("/api/secret")
    async def secret():
        return {"vault": "contents"}

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    return app


def _get(app, path="/api/secret", peer="127.0.0.1", headers=None):
    """Issue a request as if it arrived from `peer`.

    TestClient always reports itself as ``testclient``, and the whole point of
    this middleware is what it does with the peer address — so the ASGI app is
    driven directly with a scope we control, rather than patching TestClient
    internals to lie about the client.
    """
    received = {}

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        if message["type"] == "http.response.start":
            received["status"] = message["status"]
        elif message["type"] == "http.response.body":
            received.setdefault("body", b"")
            received["body"] += message.get("body", b"")

    raw_headers = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": raw_headers,
        "client": (peer, 12345),
        "server": ("127.0.0.1", 5000),
    }
    # asyncio.run, not get_event_loop — the latter raises on Python 3.14, which
    # is what this project runs on.
    asyncio.run(app(scope, receive, send))
    return received


class TestLoopbackPassesThrough:
    def test_ipv4_loopback_is_not_challenged(self, app_with_middleware):
        r = _get(app_with_middleware, peer="127.0.0.1")
        assert r["status"] == 200, "the desktop app must keep working with no key"

    def test_ipv6_loopback_is_not_challenged(self, app_with_middleware):
        r = _get(app_with_middleware, peer="::1")
        assert r["status"] == 200


class TestRemoteCallersAreChallenged:
    def test_remote_without_key_is_rejected(self, app_with_middleware):
        r = _get(app_with_middleware, peer="192.168.1.50")
        assert r["status"] == 401, "an off-box caller must not reach the API unauthenticated"

    def test_remote_with_invalid_key_is_rejected(self, app_with_middleware):
        r = _get(app_with_middleware, peer="192.168.1.50", headers={"X-API-Key": "not-a-real-key"})
        assert r["status"] == 401

    def test_forwarded_header_cannot_forge_loopback(self, app_with_middleware):
        """X-Forwarded-For is caller-controlled and must not grant a pass."""
        r = _get(
            app_with_middleware,
            peer="203.0.113.7",
            headers={"X-Forwarded-For": "127.0.0.1", "X-Real-IP": "127.0.0.1"},
        )
        assert r["status"] == 401, "the socket peer decides, never a header"


class TestUnauthenticatedPaths:
    def test_health_is_reachable_off_box(self, app_with_middleware):
        """Health must answer before a client could possibly hold a key."""
        r = _get(app_with_middleware, path="/api/health", peer="192.168.1.50")
        assert r["status"] == 200
