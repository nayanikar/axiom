from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..runtime_pause import get_agents_paused
from ..schemas import ClaimRequest, ClaimResult, SpaceStatus
from ..services import spacebase

router = APIRouter(prefix="/api/space", tags=["space"])


@router.get("/status", response_model=SpaceStatus)
async def status(db: AsyncSession = Depends(get_session)) -> SpaceStatus:
    raw = await spacebase.get_status(db)
    paused = await get_agents_paused()
    return SpaceStatus(**raw, agents_paused=paused)


@router.post("/claim", response_model=ClaimResult)
async def claim(req: ClaimRequest, db: AsyncSession = Depends(get_session)) -> ClaimResult:
    result = await spacebase.claim_space(db, req.claim_url, req.agent_name)
    binding = result.get("binding")
    paused = await get_agents_paused()
    return ClaimResult(
        ok=result["ok"],
        status=result["status"],
        message=result.get("message"),
        binding=SpaceStatus(**binding, agents_paused=paused) if binding else None,
        raw=result.get("raw"),
    )
