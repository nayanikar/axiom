from __future__ import annotations

from fastapi import APIRouter

from ..events import broker
from ..runtime_pause import set_agents_paused
from ..schemas import AgentsPauseBody

router = APIRouter(tags=["agents"])


@router.post("/api/agents/pause")
async def post_agents_pause(body: AgentsPauseBody) -> dict:
    paused = await set_agents_paused(body.paused)
    await broker.publish("agents.paused", {"paused": paused})
    return {"paused": paused}
