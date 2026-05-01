"""Rules for which topics belong on the knowledge graph vs the queue sidebar."""

from __future__ import annotations

from collections import defaultdict

from .models import GraphEdge, GraphNode, Topic


def is_agent_process_trace_topic(topic: Topic) -> bool:
    """Process logs (historian / connector) are not map knowledge."""
    if topic.source != "agent-trace":
        return False
    t = (topic.text or "").strip()
    return t.startswith("Pattern noticed:") or t.startswith("Explore further:")


def filter_graph_rows(
    nodes: list[GraphNode],
    edges: list[GraphEdge],
    topics_by_id: dict[str, Topic],
) -> tuple[list[GraphNode], list[GraphEdge]]:
    """Drop trace-only topic nodes, their incident edges, and dangling field/concept nodes."""
    excluded: set[int] = set()
    for n in nodes:
        if n.type != "topic" or not n.topic_id:
            continue
        t = topics_by_id.get(n.topic_id)
        if t is None or is_agent_process_trace_topic(t):
            excluded.add(n.id)

    kept_nodes = [n for n in nodes if n.id not in excluded]
    k_ids = {n.id for n in kept_nodes}
    kept_edges = [e for e in edges if e.from_node_id in k_ids and e.to_node_id in k_ids]

    deg: dict[int, int] = defaultdict(int)
    for e in kept_edges:
        deg[e.from_node_id] += 1
        deg[e.to_node_id] += 1

    final_nodes: list[GraphNode] = []
    for n in kept_nodes:
        if n.type == "topic" or deg.get(n.id, 0) > 0:
            final_nodes.append(n)

    f_ids = {n.id for n in final_nodes}
    final_edges = [e for e in kept_edges if e.from_node_id in f_ids and e.to_node_id in f_ids]
    return final_nodes, final_edges
