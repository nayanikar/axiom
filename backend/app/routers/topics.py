from __future__ import annotations

import asyncio
import json
import logging
import secrets
from datetime import datetime, timezone
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..events import broker
from ..models import AgentResponse, IntentEvent, Topic, WorkerState
from ..schemas import (
    AgentResponseRead,
    TopicCreate,
    TopicRead,
    TopicSummary,
    WorkerStateRead,
)
from ..services import spacebase
from ..services.space_watcher import watcher
from ..teachers import TEACHERS

log = logging.getLogger(__name__)

router = APIRouter(tags=["topics"])


def _new_topic_id() -> str:
    return secrets.token_hex(12)


def _summary_from(topic: Topic, responses: list[AgentResponse]) -> TopicSummary:
    return TopicSummary(
        id=topic.id,
        text=topic.text,
        root_intent_id=topic.root_intent_id,
        status=topic.status,
        source=topic.source,
        parent_topic_id=topic.parent_topic_id,
        spawned_by_teacher_id=topic.spawned_by_teacher_id,
        depth=topic.depth,
        created_at=topic.created_at,
        response_count=len(responses),
        responding_teacher_ids=[r.teacher_id for r in responses if r.status == "responding"],
        done_teacher_ids=[r.teacher_id for r in responses if r.status == "done"],
    )


@router.post("/api/topics", response_model=TopicRead, status_code=201)
async def create_topic(
    body: TopicCreate, db: AsyncSession = Depends(get_session)
) -> TopicRead:
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Topic text required")

    topic_id = _new_topic_id()
    intent = await spacebase.post_intent(
        None,
        text=f"Topic: {text}",
        parent_id=None,
        payload={
            "source": "user-queue",
            "status": "unclaimed",
            "topic": text,
            "topicId": topic_id,
            "postedAt": datetime.now(timezone.utc).isoformat(),
        },
    )

    topic = Topic(
        id=topic_id,
        text=text,
        root_intent_id=intent.intent_id,
        status="queued",
        source="user-queue",
        depth=0,
    )
    db.add(topic)
    db.add(IntentEvent(
        topic_id=topic_id, type="INTENT", intent_id=intent.intent_id,
        text=f"Topic: {text}", payload={"source": "user-queue", "topic": text},
    ))
    await db.commit()
    await db.refresh(topic)

    await broker.publish("topic.created", {
        "topic_id": topic.id,
        "text": topic.text,
        "source": topic.source,
        "depth": topic.depth,
    })
    # Force a watcher refresh so workers can observe the INTENT we just posted.
    asyncio.create_task(watcher.refresh())

    return TopicRead(
        id=topic.id,
        text=topic.text,
        root_intent_id=topic.root_intent_id,
        status=topic.status,
        source=topic.source,
        parent_topic_id=topic.parent_topic_id,
        spawned_by_teacher_id=topic.spawned_by_teacher_id,
        depth=topic.depth,
        created_at=topic.created_at,
        responses=[],
    )


@router.get("/api/topics", response_model=list[TopicSummary])
async def list_topics(
    limit: int = 100, db: AsyncSession = Depends(get_session)
) -> list[TopicSummary]:
    rows = (
        await db.execute(
            select(Topic).order_by(Topic.created_at.desc()).limit(limit)
        )
    ).scalars().all()
    out: list[TopicSummary] = []
    for topic in rows:
        responses = (
            await db.execute(
                select(AgentResponse).where(AgentResponse.topic_id == topic.id)
            )
        ).scalars().all()
        out.append(_summary_from(topic, list(responses)))
    return out


@router.get("/api/topics/{topic_id}")
async def get_topic(topic_id: str, db: AsyncSession = Depends(get_session)) -> dict:
    topic = await db.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(404, "Topic not found")
    responses = (
        await db.execute(
            select(AgentResponse)
            .where(AgentResponse.topic_id == topic_id)
            .order_by(AgentResponse.id)
        )
    ).scalars().all()
    children = (
        await db.execute(
            select(Topic).where(Topic.parent_topic_id == topic_id).order_by(Topic.created_at)
        )
    ).scalars().all()
    payload = TopicRead(
        id=topic.id,
        text=topic.text,
        root_intent_id=topic.root_intent_id,
        status=topic.status,
        source=topic.source,
        parent_topic_id=topic.parent_topic_id,
        spawned_by_teacher_id=topic.spawned_by_teacher_id,
        depth=topic.depth,
        created_at=topic.created_at,
        responses=[
            AgentResponseRead.model_validate(r, from_attributes=True) for r in responses
        ],
    )
    out = payload.model_dump(mode="json")
    out["children"] = [
        TopicSummary(
            id=c.id,
            text=c.text,
            root_intent_id=c.root_intent_id,
            status=c.status,
            source=c.source,
            parent_topic_id=c.parent_topic_id,
            spawned_by_teacher_id=c.spawned_by_teacher_id,
            depth=c.depth,
            created_at=c.created_at,
            response_count=0,
            responding_teacher_ids=[],
            done_teacher_ids=[],
        ).model_dump(mode="json")
        for c in children
    ]
    return out


@router.get("/api/agents/state", response_model=list[WorkerStateRead])
async def agents_state(db: AsyncSession = Depends(get_session)) -> list[WorkerStateRead]:
    from ..config import get_settings
    settings = get_settings()
    rows = (
        await db.execute(select(WorkerState))
    ).scalars().all()
    by_id = {r.teacher_id: r for r in rows}
    out: list[WorkerStateRead] = []
    for t in TEACHERS:
        row = by_id.get(t.id)
        if row is None:
            out.append(WorkerStateRead(
                teacher_id=t.id,
                worker_agent_id=f"{t.id}-pending",
                status="sleeping",
                interval_s=settings.interval_for(t.id),
                daily_cap=settings.worker_daily_cap,
            ))
            continue
        out.append(WorkerStateRead(
            teacher_id=row.teacher_id,
            worker_agent_id=row.worker_agent_id,
            status=row.status,
            last_poll_at=row.last_poll_at,
            last_picked_topic_id=row.last_picked_topic_id,
            last_picked_at=row.last_picked_at,
            last_error=row.last_error,
            calls_today=row.calls_today,
            interval_s=settings.interval_for(t.id),
            daily_cap=settings.worker_daily_cap,
        ))
    return out


@router.get("/api/events")
async def events_stream() -> StreamingResponse:
    async def stream() -> AsyncIterator[bytes]:
        queue, replay = await broker.subscribe()
        try:
            for evt in replay:
                yield _sse(evt)
            keepalive_every = 15.0
            while True:
                try:
                    evt = await asyncio.wait_for(queue.get(), timeout=keepalive_every)
                except asyncio.TimeoutError:
                    yield b": keepalive\n\n"
                    continue
                yield _sse(evt)
        finally:
            await broker.unsubscribe(queue)

    return StreamingResponse(stream(), media_type="text/event-stream")


def _sse(evt: dict) -> bytes:
    return f"event: {evt['type']}\ndata: {json.dumps(evt, ensure_ascii=False)}\n\n".encode("utf-8")
