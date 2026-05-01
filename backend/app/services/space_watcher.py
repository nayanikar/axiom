"""Recursive Spacebase1 snapshot watcher.

A single asyncio task scans the bound space (and every INTENT sub-space)
every `watcher_interval_s` seconds. The result is stashed in an in-memory
`SpaceSnapshot` so AgentWorkers can read live state without hammering
Spacebase1 themselves.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

from ..config import get_settings
from . import spacebase

log = logging.getLogger(__name__)


@dataclass
class SpaceSnapshot:
    intents: list[dict] = field(default_factory=list)
    promises: list[dict] = field(default_factory=list)
    completes: list[dict] = field(default_factory=list)
    children_by_parent: dict[str, list[dict]] = field(default_factory=dict)
    intents_by_id: dict[str, dict] = field(default_factory=dict)
    fetched_at: float = 0.0
    error: Optional[str] = None

    def completes_for(self, intent_id: str) -> list[dict]:
        return [m for m in self.children_by_parent.get(intent_id, []) if m.get("type") == "COMPLETE"]

    def promises_for(self, intent_id: str) -> list[dict]:
        return [m for m in self.children_by_parent.get(intent_id, []) if m.get("type") == "PROMISE"]


def _agent_id_of(message: dict) -> Optional[str]:
    payload = message.get("payload") or {}
    if isinstance(payload, dict):
        return payload.get("agentId") or payload.get("teacherId")
    return None


def _build_snapshot(messages: list[dict]) -> SpaceSnapshot:
    snap = SpaceSnapshot(fetched_at=time.time())
    for msg in messages:
        mtype = msg.get("type")
        parent = msg.get("parentId")
        if parent:
            snap.children_by_parent.setdefault(parent, []).append(msg)
        if mtype == "INTENT":
            snap.intents.append(msg)
            iid = msg.get("intentId")
            if isinstance(iid, str):
                snap.intents_by_id[iid] = msg
        elif mtype == "PROMISE":
            snap.promises.append(msg)
        elif mtype == "COMPLETE":
            snap.completes.append(msg)
    return snap


class SpaceWatcher:
    """Polls Spacebase1 and exposes the latest `SpaceSnapshot`."""

    def __init__(self) -> None:
        self._snapshot = SpaceSnapshot()
        self._stop = asyncio.Event()
        self._lock = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None
        settings = get_settings()
        self._interval = max(1.0, float(settings.watcher_interval_s))

    @property
    def snapshot(self) -> SpaceSnapshot:
        return self._snapshot

    async def _scan_once(self) -> SpaceSnapshot:
        sess = await spacebase._ensure_session()  # noqa: SLF001 (intentional)
        if sess is None:
            return SpaceSnapshot(fetched_at=time.time(), error="no-session")
        try:
            messages = await asyncio.to_thread(spacebase.list_all_messages_sync, sess)
        except Exception as exc:  # noqa: BLE001
            log.warning("watcher scan failed: %s", exc)
            return SpaceSnapshot(fetched_at=time.time(), error=str(exc))
        return _build_snapshot(messages)

    async def refresh(self) -> SpaceSnapshot:
        snap = await self._scan_once()
        async with self._lock:
            self._snapshot = snap
        return snap

    async def run(self) -> None:
        log.info("SpaceWatcher started (interval=%.1fs)", self._interval)
        try:
            while not self._stop.is_set():
                await self.refresh()
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=self._interval)
                except asyncio.TimeoutError:
                    continue
                else:
                    break
        finally:
            log.info("SpaceWatcher stopped")

    def start(self) -> asyncio.Task:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self.run(), name="space-watcher")
        return self._task

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=5.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._task.cancel()


# Process-wide singleton wired up in `app.main.lifespan`.
watcher = SpaceWatcher()
