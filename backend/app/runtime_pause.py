"""Process-wide pause flag so AgentWorkers and Cartographer skip Anthropic calls."""

from __future__ import annotations

import asyncio

_lock = asyncio.Lock()
_agents_paused: bool = False


async def get_agents_paused() -> bool:
    async with _lock:
        return _agents_paused


async def set_agents_paused(value: bool) -> bool:
    global _agents_paused
    async with _lock:
        _agents_paused = value
        return _agents_paused
