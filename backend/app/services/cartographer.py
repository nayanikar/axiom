"""Cartographer: a single async task that watches for `done` topics and
builds a typed Field/Concept/Topic graph around each one via Anthropic.

The Cartographer is *not* a teacher; the seven AgentWorkers are unchanged.
It runs alongside `SpaceWatcher` in the FastAPI lifespan.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import AsyncSessionLocal
from ..events import broker
from ..graph_filters import is_agent_process_trace_topic
from ..models import AgentResponse, GraphEdge, GraphNode, Topic
from ..runtime_pause import get_agents_paused
from .anthropic import AnthropicError, extract_graph

log = logging.getLogger(__name__)

_BUILD_CONTEXT_TEACHER_PRIORITY = ["connector", "analogy", "historian", "anchor"]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _label_key(label: str) -> str:
    return label.strip().lower()


async def _get_or_create_topic_node(
    db: AsyncSession, topic: Topic
) -> GraphNode:
    """Find or create the canonical `topic`-typed graph node for this Topic."""
    row = (
        await db.execute(
            select(GraphNode).where(
                GraphNode.type == "topic", GraphNode.topic_id == topic.id
            )
        )
    ).scalar_one_or_none()
    if row is not None:
        return row
    node = GraphNode(
        type="topic",
        label=topic.text[:120],
        label_key=_label_key(topic.text),
        topic_id=topic.id,
        source_topic_id=topic.id,
    )
    db.add(node)
    await db.flush()
    return node


async def _get_or_create_typed_node(
    db: AsyncSession, *, type_: str, label: str, source_topic_id: str
) -> GraphNode:
    """Find or create a field/concept node by case-insensitive label across the space."""
    key = _label_key(label)
    row = (
        await db.execute(
            select(GraphNode).where(
                GraphNode.type == type_, GraphNode.label_key == key
            )
        )
    ).scalar_one_or_none()
    if row is not None:
        return row
    node = GraphNode(
        type=type_,
        label=label[:120],
        label_key=key,
        topic_id=None,
        source_topic_id=source_topic_id,
    )
    db.add(node)
    await db.flush()
    return node


async def _edge_exists(
    db: AsyncSession, *, from_id: int, to_id: int, edge_type: str
) -> bool:
    row = (
        await db.execute(
            select(GraphEdge.id).where(
                GraphEdge.from_node_id == from_id,
                GraphEdge.to_node_id == to_id,
                GraphEdge.edge_type == edge_type,
            )
        )
    ).first()
    return row is not None


def _build_responses_text(responses: list[AgentResponse]) -> str:
    """Concatenate the most useful teacher responses for graph extraction."""
    by_teacher = {r.teacher_id: r for r in responses if r.text}
    chunks: list[str] = []
    for tid in _BUILD_CONTEXT_TEACHER_PRIORITY:
        r = by_teacher.get(tid)
        if r and r.text:
            chunks.append(f"[{tid}] {r.text.strip()}")
    # Then append anyone else for breadth.
    for r in responses:
        if r.teacher_id in _BUILD_CONTEXT_TEACHER_PRIORITY:
            continue
        if r.text:
            chunks.append(f"[{r.teacher_id}] {r.text.strip()}")
    return "\n\n".join(chunks)


class Cartographer:
    """Polls completed topics and writes their graph extraction to the DB."""

    interval_s = 6.0

    def __init__(self) -> None:
        self._stop = asyncio.Event()
        self._task: Optional[asyncio.Task] = None

    def start(self) -> asyncio.Task:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self.run(), name="cartographer")
        return self._task

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=5.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._task.cancel()

    async def run(self) -> None:
        log.info("Cartographer started (interval=%.1fs)", self.interval_s)
        try:
            while not self._stop.is_set():
                try:
                    await self._tick()
                except Exception:  # noqa: BLE001
                    log.exception("Cartographer tick crashed")
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=self.interval_s)
                except asyncio.TimeoutError:
                    continue
                else:
                    break
        finally:
            log.info("Cartographer stopped")

    # ------------------------------------------------------------------ tick

    async def _tick(self) -> None:
        if await get_agents_paused():
            return

        async with AsyncSessionLocal() as db:
            todo = (
                await db.execute(
                    select(Topic)
                    .where(
                        Topic.status == "done",
                        Topic.cartographed_at.is_(None),
                    )
                    .order_by(Topic.created_at.asc())
                    .limit(3)
                )
            ).scalars().all()

        for topic in todo:
            await self._cartograph_one(topic.id)

        # Even when there's nothing new to extract, the spawn-link edges may
        # need to be (re)materialised — e.g. after a fresh DB on restart.
        await self._sync_spawned_edges()

    async def _cartograph_one(self, topic_id: str) -> None:
        async with AsyncSessionLocal() as db:
            topic = await db.get(Topic, topic_id)
            if topic is None or topic.cartographed_at is not None:
                return
            if is_agent_process_trace_topic(topic):
                topic.cartographed_at = _utcnow()
                topic.last_cartograph_error = None
                await db.commit()
                await broker.publish(
                    "graph.updated",
                    {"topic_id": topic_id, "skipped": "process-trace"},
                )
                return
            responses = (
                await db.execute(
                    select(AgentResponse)
                    .where(
                        AgentResponse.topic_id == topic_id,
                        AgentResponse.status == "done",
                    )
                    .order_by(AgentResponse.id)
                )
            ).scalars().all()
            peer_rows = (
                await db.execute(
                    select(Topic.id, Topic.text).where(Topic.id != topic_id)
                )
            ).all()
            peer_labels = [r.text for r in peer_rows]
            peer_id_by_label = {r.text.strip().lower(): r.id for r in peer_rows}

        responses_text = _build_responses_text(list(responses))

        try:
            extracted = await extract_graph(topic.text, responses_text, peer_labels)
        except AnthropicError as exc:
            log.warning("Cartographer: extract failed for topic %s: %s", topic.id, exc)
            async with AsyncSessionLocal() as db:
                t = await db.get(Topic, topic_id)
                if t is not None:
                    t.last_cartograph_error = str(exc)[:500]
                    await db.commit()
            return

        async with AsyncSessionLocal() as db:
            t = await db.get(Topic, topic_id)
            if t is None:
                return

            topic_node = await _get_or_create_topic_node(db, t)

            # Field nodes
            for entry in extracted.get("fields", []):
                fnode = await _get_or_create_typed_node(
                    db, type_="field", label=entry["label"], source_topic_id=t.id
                )
                if not await _edge_exists(
                    db, from_id=topic_node.id, to_id=fnode.id, edge_type="extends"
                ):
                    db.add(GraphEdge(
                        from_node_id=topic_node.id,
                        to_node_id=fnode.id,
                        edge_type="extends",
                        source_topic_id=t.id,
                    ))

            # Concept nodes
            for entry in extracted.get("concepts", []):
                cnode = await _get_or_create_typed_node(
                    db, type_="concept", label=entry["label"], source_topic_id=t.id
                )
                if not await _edge_exists(
                    db, from_id=topic_node.id, to_id=cnode.id, edge_type="relates"
                ):
                    db.add(GraphEdge(
                        from_node_id=topic_node.id,
                        to_node_id=cnode.id,
                        edge_type="relates",
                        source_topic_id=t.id,
                    ))

            # Cross-topic links
            for link in extracted.get("links", []):
                peer_topic_id = peer_id_by_label.get(link["to"].strip().lower())
                if not peer_topic_id:
                    continue
                peer_topic = await db.get(Topic, peer_topic_id)
                if peer_topic is None:
                    continue
                peer_node = await _get_or_create_topic_node(db, peer_topic)
                if not await _edge_exists(
                    db, from_id=topic_node.id, to_id=peer_node.id, edge_type=link["type"]
                ):
                    db.add(GraphEdge(
                        from_node_id=topic_node.id,
                        to_node_id=peer_node.id,
                        edge_type=link["type"],
                        source_topic_id=t.id,
                    ))

            t.cartographed_at = _utcnow()
            t.last_cartograph_error = None
            await db.commit()

        await broker.publish(
            "graph.updated",
            {"topic_id": topic_id, "added": True},
        )
        log.info("Cartographer: mapped topic %s (%s)", topic_id, topic.text[:60])

    async def _sync_spawned_edges(self) -> None:
        """Materialise `spawned` edges from `Topic.parent_topic_id`."""
        async with AsyncSessionLocal() as db:
            children = (
                await db.execute(
                    select(Topic).where(Topic.parent_topic_id.is_not(None))
                )
            ).scalars().all()
            published = False
            for child in children:
                if child.parent_topic_id is None:
                    continue
                if is_agent_process_trace_topic(child):
                    continue
                parent = await db.get(Topic, child.parent_topic_id)
                if parent is None:
                    continue
                child_node = await _get_or_create_topic_node(db, child)
                parent_node = await _get_or_create_topic_node(db, parent)
                if not await _edge_exists(
                    db,
                    from_id=parent_node.id,
                    to_id=child_node.id,
                    edge_type="spawned",
                ):
                    db.add(GraphEdge(
                        from_node_id=parent_node.id,
                        to_node_id=child_node.id,
                        edge_type="spawned",
                        source_topic_id=child.id,
                    ))
                    published = True
            if published:
                await db.commit()
                await broker.publish("graph.updated", {"reason": "spawned-edges"})


# Process-wide singleton wired up in `app.main.lifespan`.
cartographer = Cartographer()
