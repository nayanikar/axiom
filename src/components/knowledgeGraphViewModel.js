/**
 * Overview: explored topic nodes plus fields/concepts linked via extends/relates,
 * and surprising edges only when both endpoints are explored topics. Omits spawned chains.
 *
 * @param {Array<{ id: number; type: string; explored?: boolean }>} nodes
 * @param {Array<{ from: number; to: number; edge_type: string }>} edges
 */
export function buildOverviewSubgraph(nodes, edges) {
  const exploredIds = new Set(
    nodes.filter((n) => n.type === "topic" && n.explored).map((n) => n.id)
  );
  if (exploredIds.size === 0) {
    return { nodes, edges };
  }
  const keepIds = new Set(exploredIds);
  for (const e of edges) {
    const touchesExplored = exploredIds.has(e.from) || exploredIds.has(e.to);
    if (!touchesExplored) continue;
    if (e.edge_type === "extends" || e.edge_type === "relates") {
      keepIds.add(e.from);
      keepIds.add(e.to);
    }
    if (e.edge_type === "surprising" && exploredIds.has(e.from) && exploredIds.has(e.to)) {
      keepIds.add(e.from);
      keepIds.add(e.to);
    }
  }
  const nodesOut = nodes.filter((n) => keepIds.has(n.id));
  const idset = new Set(nodesOut.map((n) => n.id));
  const edgesOut = edges.filter((e) => idset.has(e.from) && idset.has(e.to));
  return { nodes: nodesOut, edges: edgesOut };
}

/**
 * One-hop neighbourhood of center (all edge types).
 *
 * @param {Array<{ id: number }>} nodes
 * @param {Array<{ from: number; to: number }>} edges
 * @param {number} centerId
 */
export function buildFocusSubgraph(nodes, edges, centerId) {
  if (centerId == null) return { nodes, edges };
  const nbr = new Set([centerId]);
  for (const e of edges) {
    if (e.from === centerId) nbr.add(e.to);
    if (e.to === centerId) nbr.add(e.from);
  }
  const nodesOut = nodes.filter((n) => nbr.has(n.id));
  const idset = new Set(nodesOut.map((n) => n.id));
  const edgesOut = edges.filter((e) => idset.has(e.from) && idset.has(e.to));
  return { nodes: nodesOut, edges: edgesOut };
}
