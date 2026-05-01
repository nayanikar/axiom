"""Spacebase1 integration via the intent-space-agent-pack SDK.

The SDK lives outside this repo (installed as a Cursor/Codex skill). We add it
to sys.path at import time, then drive it from FastAPI handlers via
asyncio.to_thread because the SDK is synchronous (it uses urllib + openssl).

A single HttpSpaceToolSession is cached process-wide once the space is bound.
"""
from __future__ import annotations

import asyncio
import logging
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Optional
from urllib.error import HTTPError
from urllib.parse import quote, urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import BACKEND_ROOT, get_settings
from ..models import SpaceBinding

log = logging.getLogger(__name__)

WORKSPACE = BACKEND_ROOT / "spacebase_workspace"

_SDK_CANDIDATES = [
    Path.home() / ".codex" / "skills" / "intent-space-agent-pack" / "sdk",
    Path.home() / ".claude" / "skills" / "intent-space-agent-pack" / "sdk",
]


def _resolve_sdk() -> Path:
    for candidate in _SDK_CANDIDATES:
        if (candidate / "intent_space_sdk.py").exists():
            if str(candidate) not in sys.path:
                sys.path.insert(0, str(candidate))
            return candidate
    raise RuntimeError(
        "intent-space-agent-pack SDK not found in ~/.codex/skills or ~/.claude/skills"
    )


SDK_PATH = _resolve_sdk()

# Imports below depend on SDK_PATH being on sys.path.
from _space_tools_common import (  # type: ignore  # noqa: E402
    create_complete,
    create_intent,
    create_promise,
)
from http_space_tools import HttpSpaceToolSession  # type: ignore  # noqa: E402

_session: Optional[HttpSpaceToolSession] = None
_session_lock = asyncio.Lock()
_call_lock = asyncio.Lock()


@dataclass
class IntentResult:
    intent_id: str
    simulated: bool = False
    raw: Optional[dict] = None


@dataclass
class PromiseResult:
    promise_id: str
    simulated: bool = False
    raw: Optional[dict] = None


@dataclass
class CompleteResult:
    simulated: bool = False
    raw: Optional[dict] = None


def _new_id() -> str:
    return str(uuid.uuid4())


def _build_observatory_url(origin: str, space_id: str, token: str) -> str:
    return (
        f"{origin.rstrip('/')}/observatory"
        f"#origin={quote(origin, safe='')}"
        f"&space={quote(space_id, safe='')}"
        f"&token={quote(token or '', safe='')}"
    )


def _origin_of(url: str) -> str:
    p = urlparse(url)
    if not p.scheme or not p.netloc:
        return get_settings().spacebase_origin
    return f"{p.scheme}://{p.netloc}"


def _has_enrollment() -> bool:
    return (WORKSPACE / ".intent-space" / "state" / "station-enrollment.json").exists()


def _build_session_sync(endpoint: str, agent_name: str) -> HttpSpaceToolSession:
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    return HttpSpaceToolSession(
        endpoint=endpoint, workspace=WORKSPACE, agent_name=agent_name
    )


def _restore_session_sync() -> Optional[HttpSpaceToolSession]:
    if not _has_enrollment():
        return None
    settings = get_settings()
    sess = _build_session_sync(settings.spacebase_origin, settings.agent_name)
    sess.connect()
    return sess


async def _ensure_session() -> Optional[HttpSpaceToolSession]:
    global _session
    async with _session_lock:
        if _session is not None:
            return _session
        try:
            _session = await asyncio.to_thread(_restore_session_sync)
        except HTTPError as e:
            if e.code in (401, 403):
                log.warning(
                    "Stored Spacebase1 session is no longer valid (%s). "
                    "Re-bind via the Intent Space dialog if you need live mode.",
                    e.code,
                )
            else:
                log.exception("Failed to restore Spacebase1 session from disk")
            _session = None
        except Exception:
            log.exception("Failed to restore Spacebase1 session from disk")
            _session = None
        return _session


def get_session_sync() -> Optional[HttpSpaceToolSession]:
    """Synchronous accessor for use inside `asyncio.to_thread` callbacks."""
    return _session


async def get_binding(db: AsyncSession) -> Optional[SpaceBinding]:
    return (
        await db.execute(select(SpaceBinding).where(SpaceBinding.id == 1))
    ).scalar_one_or_none()


async def get_status(db: AsyncSession) -> dict:
    settings = get_settings()
    binding = await get_binding(db)
    connected = bool(binding and binding.station_token)
    return {
        "connected": connected,
        "simulated": not connected,
        "space_id": (binding.space_id if binding else None) or settings.space_id,
        "agent_name": (binding.agent_name if binding else None) or settings.agent_name,
        "observatory_url": binding.observatory_url if binding else None,
        "origin": (binding.origin if binding else None) or settings.spacebase_origin,
    }


def _http_error_readable(exc: HTTPError) -> str:
    chunk = ""
    try:
        chunk = exc.read().decode("utf-8", errors="replace").strip()
    except Exception:
        chunk = ""
    headline = getattr(exc, "reason", "") or ""
    bits = [f"HTTP Error {exc.code}: {headline}".strip()]
    if chunk:
        bits.append(chunk[:800])
    return " — ".join(bits)


async def claim_space(
    db: AsyncSession, claim_url: str, agent_name: Optional[str] = None
) -> dict:
    """Run the SDK signup + connect dance, persist enrollment, cache the session."""
    global _session
    settings = get_settings()
    name = agent_name or settings.agent_name

    def _do() -> tuple[HttpSpaceToolSession, dict]:
        sess = _build_session_sync(claim_url, name)
        result = sess.signup(claim_url, handle=name)
        sess.connect()
        return sess, result

    try:
        sess, result = await asyncio.to_thread(_do)
    except HTTPError as exc:
        log.warning(
            "Spacebase1 claim signup failed: code=%s url=%s",
            exc.code,
            getattr(exc, "url", None),
        )
        detail = _http_error_readable(exc)
        if exc.code == 409:
            rel = WORKSPACE.relative_to(BACKEND_ROOT)
            hint = (
                "Spacebase1 rejected enrollment (409 Conflict). Typical causes: "
                "(1) This claim URL was already consumed—ask for a new invite. "
                "(2) Old station keys are still on disk—stop the API, delete the folder "
                f"`{rel}/.intent-space/` (identity + state), start again, and retry bind. "
                "(3) Agent name must match the invitation label exactly (e.g. axiom). "
                f"Server said: {detail}"
            )
        else:
            hint = f"Spacebase1 signup failed: {detail}"
        return {"ok": False, "status": exc.code, "message": hint, "raw": None}
    except Exception as exc:
        log.exception("Spacebase1 claim failed")
        return {"ok": False, "status": 0, "message": str(exc), "raw": None}

    _session = sess

    space_id = (
        result.get("space_id")
        or result.get("commons_space_id")
        or sess.current_space_id
        or sess.declared_default_space_id
        or settings.space_id
    )
    station_token = result.get("station_token")
    station_endpoint = result.get("station_endpoint") or settings.spacebase_origin
    origin = _origin_of(station_endpoint)
    observatory_url = result.get("observatory_url") or _build_observatory_url(
        origin, space_id, station_token or ""
    )
    principal_id = result.get("principal_id") or result.get("handle") or name

    binding = await get_binding(db)
    if binding is None:
        binding = SpaceBinding(id=1)
        db.add(binding)
    binding.space_id = space_id
    binding.origin = origin
    binding.agent_id = principal_id
    binding.agent_name = name
    binding.station_token = station_token
    binding.observatory_url = observatory_url
    binding.raw_response = result
    await db.commit()

    log.info(
        "Spacebase1 bound: space=%s endpoint=%s observatory=%s",
        space_id,
        station_endpoint,
        observatory_url,
    )

    return {
        "ok": True,
        "status": 200,
        "message": "Bound",
        "raw": result,
        "binding": {
            "connected": bool(station_token),
            "simulated": not station_token,
            "space_id": space_id,
            "agent_name": name,
            "observatory_url": observatory_url,
            "origin": origin,
        },
    }


def root_space_id_sync(sess: HttpSpaceToolSession) -> str:
    settings = get_settings()
    return (
        sess.current_space_id
        or sess.declared_default_space_id
        or settings.space_id
    )


def _root_space_id(sess: HttpSpaceToolSession, fallback: str) -> str:
    return (
        sess.current_space_id
        or sess.declared_default_space_id
        or fallback
    )


# ---------------------------------------------------------------------------
# Recursive scan helpers (synchronous, called from the watcher in a thread)
# ---------------------------------------------------------------------------


def _scan_messages(sess: HttpSpaceToolSession, space_id: str) -> list[dict]:
    try:
        result = sess.scan_full(space_id)
    except Exception as exc:  # noqa: BLE001
        log.warning("scan_full(%s) failed: %s", space_id, exc)
        return []
    return list(result.get("messages") or [])


def list_all_messages_sync(
    sess: HttpSpaceToolSession,
    *,
    root_space_id: Optional[str] = None,
    max_depth: int = 4,
) -> list[dict]:
    """Recursively scan the bound space and every INTENT sub-space.

    Each intent in Spacebase1 acts as a sub-space addressable by its intentId,
    so to see the whole graph we do a BFS: start at the root, scan, then for
    every INTENT we discover, scan its sub-space. We dedupe messages by their
    natural key (`promiseId`/`intentId`/(senderId, timestamp)).
    """

    if sess is None:
        return []
    root = root_space_id or root_space_id_sync(sess)

    seen_spaces: set[str] = set()
    queue: list[tuple[str, int]] = [(root, 0)]
    all_messages: list[dict] = []
    seen_keys: set[tuple] = set()

    while queue:
        space, depth = queue.pop(0)
        if not space or space in seen_spaces:
            continue
        seen_spaces.add(space)
        for msg in _scan_messages(sess, space):
            key = (
                msg.get("type"),
                msg.get("intentId"),
                msg.get("promiseId"),
                msg.get("senderId"),
                msg.get("timestamp"),
            )
            if key in seen_keys:
                continue
            seen_keys.add(key)
            all_messages.append(msg)
            if (
                msg.get("type") == "INTENT"
                and isinstance(msg.get("intentId"), str)
                and depth < max_depth
            ):
                queue.append((msg["intentId"], depth + 1))
    return all_messages


# ---------------------------------------------------------------------------
# ITP framed message posters
# ---------------------------------------------------------------------------


async def post_intent(
    db: Optional[AsyncSession],
    *,
    text: str,
    parent_id: Optional[str] = None,
    payload: Optional[dict] = None,
) -> IntentResult:
    settings = get_settings()
    sess = await _ensure_session()
    if sess is None:
        intent_id = _new_id()
        log.info("[sim] INTENT %s", text[:60])
        return IntentResult(intent_id=intent_id, simulated=True)
    parent = parent_id or _root_space_id(sess, settings.space_id)
    msg = create_intent(
        sess.agent_id, text, parent_id=parent, payload=payload or {}
    )
    try:
        async with _call_lock:
            await asyncio.to_thread(sess.post, msg)
    except Exception as exc:
        log.warning("INTENT post failed (%s); falling back to simulated", exc)
        return IntentResult(intent_id=msg["intentId"], simulated=True, raw={"error": str(exc)})
    return IntentResult(intent_id=msg["intentId"], raw=msg)


async def post_promise(
    db: Optional[AsyncSession],
    *,
    intent_id: str,
    text: str,
    payload: Optional[dict] = None,
) -> PromiseResult:
    sess = await _ensure_session()
    if sess is None:
        promise_id = _new_id()
        log.info("[sim] PROMISE %s", text[:60])
        return PromiseResult(promise_id=promise_id, simulated=True)
    msg = create_promise(
        sess.agent_id,
        parent_id=intent_id,
        intent_id=intent_id,
        content=text,
        payload=payload or {},
    )
    try:
        async with _call_lock:
            await asyncio.to_thread(sess.post, msg)
    except Exception as exc:
        log.warning("PROMISE post failed (%s); falling back to simulated", exc)
        return PromiseResult(promise_id=msg["promiseId"], simulated=True, raw={"error": str(exc)})
    return PromiseResult(promise_id=msg["promiseId"], raw=msg)


async def post_complete(
    db: Optional[AsyncSession],
    *,
    intent_id: str,
    promise_id: str,
    text: str,
    payload: Optional[dict] = None,
) -> CompleteResult:
    sess = await _ensure_session()
    if sess is None:
        log.info("[sim] COMPLETE intent=%s", intent_id)
        return CompleteResult(simulated=True)
    msg = create_complete(
        sess.agent_id,
        promise_id=promise_id,
        parent_id=intent_id,
        summary=text,
        payload=payload or {},
    )
    try:
        async with _call_lock:
            await asyncio.to_thread(sess.post, msg)
    except Exception as exc:
        log.warning("COMPLETE post failed (%s); falling back to simulated", exc)
        return CompleteResult(simulated=True, raw={"error": str(exc)})
    return CompleteResult(raw=msg)
