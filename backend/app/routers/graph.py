from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..graph_filters import filter_graph_rows
from ..models import AgentResponse, GraphEdge, GraphNode, Topic

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("")
async def get_graph(db: AsyncSession = Depends(get_session)) -> dict:
    nodes = (await db.execute(select(GraphNode))).scalars().all()
    edges = (await db.execute(select(GraphEdge))).scalars().all()

    topic_ids = {n.topic_id for n in nodes if n.type == "topic" and n.topic_id}
    topics_by_id: dict[str, Topic] = {}
    if topic_ids:
        rows = (
            await db.execute(select(Topic).where(Topic.id.in_(topic_ids)))
        ).scalars().all()
        topics_by_id = {t.id: t for t in rows}

    nodes, edges = filter_graph_rows(list(nodes), list(edges), topics_by_id)

    response_counts: dict[str, int] = {}
    if any(n.type == "topic" and n.topic_id for n in nodes):
        rows = (
            await db.execute(
                select(AgentResponse.topic_id, func.count(AgentResponse.id))
                .where(AgentResponse.status == "done")
                .group_by(AgentResponse.topic_id)
            )
        ).all()
        response_counts = {tid: int(c) for tid, c in rows}

    explored = (
        await db.scalar(
            select(func.count(Topic.id)).where(Topic.cartographed_at.is_not(None))
        )
    ) or 0

    nodes_out = []
    for n in nodes:
        row = {
            "id": n.id,
            "type": n.type,
            "label": n.label,
            "topic_id": n.topic_id,
            "source_topic_id": n.source_topic_id,
            "weight": response_counts.get(n.topic_id, 0) if n.type == "topic" else 0,
            "explored": False,
        }
        if n.type == "topic" and n.topic_id:
            t = topics_by_id.get(n.topic_id)
            row["explored"] = bool(t and t.cartographed_at is not None)
        nodes_out.append(row)

    edges_out = [
        {
            "id": e.id,
            "from": e.from_node_id,
            "to": e.to_node_id,
            "edge_type": e.edge_type,
            "source_topic_id": e.source_topic_id,
        }
        for e in edges
    ]
    return {
        "nodes": nodes_out,
        "edges": edges_out,
        "stats": {
            "nodes": len(nodes_out),
            "edges": len(edges_out),
            "explored": int(explored),
        },
    }
