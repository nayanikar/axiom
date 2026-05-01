"""Global SSE broker.

A single in-memory channel that fans events from the watcher and AgentWorkers
out to every connected `/api/events` listener. Late joiners get a replay of
the last `REPLAY_LIMIT` events so the UI can rebuild state without polling.

Event shape:
    { "type": "topic.created"|"topic.claimed"|"topic.responding"|
              "topic.responded"|"topic.spawned"|"topic.capped"|
              "agent.scanning"|"agent.working"|"agent.idle"|"agent.error",
      "ts": <unix-ms>,
      "data": { ... } }
"""
from __future__ import annotations

import asyncio
import time
from collections import deque
from typing import Any, Deque

REPLAY_LIMIT = 200


class EventBroker:
    def __init__(self, replay_limit: int = REPLAY_LIMIT) -> None:
        self._subs: list[asyncio.Queue] = []
        self._replay: Deque[dict] = deque(maxlen=replay_limit)
        self._lock = asyncio.Lock()

    async def subscribe(self) -> tuple[asyncio.Queue, list[dict]]:
        async with self._lock:
            queue: asyncio.Queue = asyncio.Queue(maxsize=1024)
            self._subs.append(queue)
            replay = list(self._replay)
            return queue, replay

    async def unsubscribe(self, queue: asyncio.Queue) -> None:
        async with self._lock:
            try:
                self._subs.remove(queue)
            except ValueError:
                pass

    async def publish(self, event_type: str, data: dict[str, Any]) -> None:
        evt = {"type": event_type, "ts": int(time.time() * 1000), "data": data}
        async with self._lock:
            self._replay.append(evt)
            subs = list(self._subs)
        for q in subs:
            try:
                q.put_nowait(evt)
            except asyncio.QueueFull:
                # drop oldest by reading once, then push
                try:
                    q.get_nowait()
                except Exception:
                    pass
                try:
                    q.put_nowait(evt)
                except Exception:
                    pass

    def publish_nowait(self, event_type: str, data: dict[str, Any]) -> None:
        """Synchronous helper for code paths that don't have an event loop reference."""
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            return
        if loop.is_running():
            loop.create_task(self.publish(event_type, data))


broker = EventBroker()
