import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
import { useEffect, useMemo, useRef, useState } from "react";

/** @param {{ type: string; weight?: number; explored?: boolean }} node */
function nodeRadius(node) {
  if (node.type === "topic") {
    const base = node.explored ? 14 : 10;
    return base + Math.min(4, node.weight || 0);
  }
  if (node.type === "field") return 7;
  return 2.8;
}

function typeLabel(type) {
  if (type === "topic") return "Topic";
  if (type === "field") return "Field";
  return "Concept";
}

/** Invisible target ~44px+ for pointer/touch; does not affect visible layout */
function hitSlopRadius(type, r) {
  if (type === "field") {
    const s = r + 0.5;
    return Math.max(s * 1.55 + 10, 22);
  }
  return Math.max(r + 18, 22);
}

/**
 * @param {{
 *   nodes: object[];
 *   edges: object[];
 *   onSelectTopic?: (topicId: string) => void;
 *   mode: "overview" | "focus";
 *   focusCenterId: number | null;
 *   onEnterFocus: (nodeId: number) => void;
 *   onExitFocus: () => void;
 * }} props
 */
export function KnowledgeGraph({
  nodes,
  edges,
  onSelectTopic,
  mode,
  focusCenterId,
  onEnterFocus,
  onExitFocus,
}) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height: 580 });
  const [tick, setTick] = useState(0);
  const [hoverId, setHoverId] = useState(null);
  const [kbFocusId, setKbFocusId] = useState(/** @type {number | null} */ (null));
  const simRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setSize({ width: cr.width, height: cr.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const simData = useMemo(() => {
    const nodesById = new Map();
    const simNodes = nodes.map((n) => {
      const copy = { ...n };
      nodesById.set(n.id, copy);
      return copy;
    });
    const simLinks = edges
      .map((e) => ({
        source: nodesById.get(e.from),
        target: nodesById.get(e.to),
        edge_type: e.edge_type,
        id: e.id,
      }))
      .filter((l) => l.source && l.target);
    return { nodes: simNodes, links: simLinks };
  }, [nodes, edges]);

  useEffect(() => {
    if (!simData.nodes.length) return;
    const sim = forceSimulation(simData.nodes)
      .alphaMin(0.001)
      .velocityDecay(0.26)
      .force(
        "link",
        forceLink(simData.links)
          .id((d) => d.id)
          .distance((l) =>
            l.edge_type === "spawned"
              ? 56
              : l.edge_type === "surprising"
                ? 120
                : 88
          )
          .strength(0.5)
      )
      .force("charge", forceManyBody().strength(-220))
      .force("center", forceCenter(size.width / 2, size.height / 2))
      .force("x", forceX(size.width / 2).strength(0.014))
      .force("y", forceY(size.height / 2).strength(0.014))
      .force("collide", forceCollide().radius((d) => nodeRadius(d) + 14));

    sim.on("tick", () => {
      setTick((t) => t + 1);
    });

    sim.alpha(1);
    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [simData, size.width, size.height]);

  const neighbours = useMemo(() => {
    const m = new Map();
    for (const link of simData.links) {
      const a = typeof link.source === "object" ? link.source.id : link.source;
      const b = typeof link.target === "object" ? link.target.id : link.target;
      if (!m.has(a)) m.set(a, new Set());
      if (!m.has(b)) m.set(b, new Set());
      m.get(a).add(b);
      m.get(b).add(a);
    }
    return m;
  }, [simData]);

  function isDimmed(id) {
    const anchor = hoverId;
    if (!anchor) return false;
    if (id === anchor) return false;
    return !neighbours.get(anchor)?.has(id);
  }

  function isLinkDimmed(link) {
    const anchor = hoverId;
    if (!anchor) return false;
    const s = typeof link.source === "object" ? link.source.id : link.source;
    const t = typeof link.target === "object" ? link.target.id : link.target;
    return !(s === anchor || t === anchor);
  }

  function handleNodeClick(node) {
    if (mode === "overview") {
      onEnterFocus(node.id);
      return;
    }
    if (focusCenterId === node.id) {
      if (node.type === "topic" && node.topic_id && onSelectTopic) {
        onSelectTopic(node.topic_id);
      } else {
        onExitFocus();
      }
      return;
    }
    onEnterFocus(node.id);
    if (simRef.current) {
      simRef.current.alpha(0.55).restart();
    }
  }

  void tick;

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", height: "100%", width: "100%" }}
    >
      <svg
        role="img"
        aria-label="Knowledge graph"
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        style={{ touchAction: "manipulation" }}
      >
        <defs>
          <filter
            id="graphTopicShadow"
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
            colorInterpolationFilters="sRGB"
          >
            <feDropShadow
              dx="0"
              dy="1.5"
              stdDeviation="2.2"
              floodColor="rgb(44, 40, 36)"
              floodOpacity="0.2"
            />
          </filter>
        </defs>
        <g data-graph-edges>
          {simData.links.map((link) => {
            const dimmed = isLinkDimmed(link);
            const isSurprising = link.edge_type === "surprising";
            return (
              <line
                key={link.id}
                data-edge={link.edge_type}
                className={isSurprising ? "graph-edge-surprising" : "graph-edge-normal"}
                x1={link.source.x || 0}
                y1={link.source.y || 0}
                x2={link.target.x || 0}
                y2={link.target.y || 0}
                opacity={dimmed ? 0.25 : 1}
                strokeLinecap="round"
              />
            );
          })}
        </g>

        <g data-graph-nodes>
          {simData.nodes.map((n) => {
            const dimmed = isDimmed(n.id);
            const r = nodeRadius(n);
            const cx = n.x || 0;
            const cy = n.y || 0;
            const isFocusCenter = focusCenterId === n.id;
            const showConceptLabel = hoverId === n.id || isFocusCenter;
            const isTopic = n.type === "topic";
            const hitR = hitSlopRadius(n.type, r);
            const labelText = (n.label || "").trim() || "Untitled";
            const tip = `${labelText} — ${typeLabel(n.type)}`;
            const kbFocused = kbFocusId === n.id;

            return (
              <g
                key={n.id}
                data-node-id={n.id}
                data-node-type={n.type}
                transform={`translate(${cx} ${cy})`}
                onMouseEnter={() => setHoverId(n.id)}
                onMouseLeave={() => setHoverId((cur) => (cur === n.id ? null : cur))}
                onClick={() => handleNodeClick(n)}
                onKeyDown={
                  isTopic
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleNodeClick(n);
                        }
                      }
                    : undefined
                }
                onFocus={
                  isTopic
                    ? () => setKbFocusId(n.id)
                    : undefined
                }
                onBlur={
                  isTopic
                    ? (e) => {
                        if (!e.currentTarget.contains(e.relatedTarget)) {
                          setKbFocusId((id) => (id === n.id ? null : id));
                        }
                      }
                    : undefined
                }
                tabIndex={isTopic ? 0 : undefined}
                role={isTopic ? "button" : undefined}
                aria-label={tip}
                style={{ cursor: "pointer", opacity: dimmed ? 0.25 : 1 }}
                title={tip}
              >
                <circle r={hitR} fill="transparent" stroke="none" aria-hidden />
                <NodeShape
                  type={n.type}
                  r={r}
                  focusCenter={isFocusCenter}
                  showTopicFocusRing={isTopic && kbFocused && !isFocusCenter}
                />
                <NodeLabel
                  node={n}
                  focusCenter={isFocusCenter}
                  radius={r}
                  showConceptLabel={showConceptLabel}
                />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/** @param {{ type: string; r: number; focusCenter: boolean; showTopicFocusRing?: boolean }} props */
function NodeShape({ type, r, focusCenter, showTopicFocusRing }) {
  const topicRing = focusCenter || showTopicFocusRing;
  if (type === "topic") {
    return (
      <circle
        r={r}
        className="graph-node-topic"
        stroke={topicRing ? "var(--accent)" : "none"}
        strokeWidth={
          topicRing ? (showTopicFocusRing && !focusCenter ? 2.8 : 2.5) : 0
        }
      />
    );
  }
  if (type === "field") {
    const s = r + 0.5;
    return (
      <rect
        x={-s}
        y={-s}
        width={s * 2}
        height={s * 2}
        transform="rotate(45)"
        className="graph-node-field"
      />
    );
  }
  return (
    <circle
      r={r}
      className="graph-node-concept"
      stroke={focusCenter ? "var(--accent)" : undefined}
      strokeWidth={focusCenter ? 1.8 : 1.2}
    />
  );
}

/** @param {{ node: object; focusCenter: boolean; radius: number; showConceptLabel: boolean }} props */
function NodeLabel({ node, focusCenter, radius, showConceptLabel }) {
  const offsetY = radius + 14;
  if (focusCenter && node.type === "topic") {
    const padX = 8;
    const text = node.label || "";
    const charW = 6.4;
    const w = Math.max(70, Math.min(220, text.length * charW + padX * 2));
    return (
      <g transform={`translate(0 ${offsetY - 6})`}>
        <rect
          x={-w / 2}
          y={-6}
          width={w}
          height={22}
          rx={4}
          ry={4}
          fill="var(--surface-elevated)"
          stroke="var(--accent)"
          strokeWidth={1.25}
        />
        <text
          textAnchor="middle"
          y={9}
          style={{
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "var(--font-body)",
            fill: "var(--ink)",
          }}
        >
          {text.length > 32 ? text.slice(0, 31) + "…" : text}
        </text>
      </g>
    );
  }
  if (node.type === "concept" && !showConceptLabel) {
    return null;
  }
  const muted = node.type !== "topic";
  const label = node.label?.length > 28 ? node.label.slice(0, 27) + "…" : node.label;
  return (
    <text
      textAnchor="middle"
      y={offsetY}
      style={{
        fontSize: node.type === "field" ? 10 : 11,
        fontFamily: "var(--font-body)",
        fill: muted ? "var(--ink-faint)" : "var(--ink)",
        userSelect: "none",
      }}
    >
      {label}
    </text>
  );
}
