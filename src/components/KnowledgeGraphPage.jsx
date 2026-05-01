import { useMemo, useState } from "react";

import { KnowledgeGraph } from "@/components/KnowledgeGraph";
import { buildFocusSubgraph, buildOverviewSubgraph } from "@/components/knowledgeGraphViewModel";
import { cn } from "@/lib/utils";

const LEGEND = [
  { type: "topic", label: "Topic (explored)", swatch: "circle-filled" },
  { type: "field", label: "Field", swatch: "diamond" },
  { type: "concept", label: "Concept", swatch: "circle-tiny-outline" },
  { type: "surprising", label: "Surprising link", swatch: "edge-surprising" },
];

function Swatch({ kind }) {
  if (kind === "circle-filled") {
    return (
      <span className="inline-block size-2.5 rounded-full bg-[var(--graph-topic-fill)]" />
    );
  }
  if (kind === "diamond") {
    return (
      <span
        className="inline-block size-2.5 rotate-45 border-[1.5px] border-[var(--ink-mid)]"
      />
    );
  }
  if (kind === "circle-tiny-outline") {
    return (
      <span className="box-border inline-block size-[7px] rounded-full border-[1.5px] border-[var(--ink-mid)] bg-transparent" />
    );
  }
  if (kind === "edge-surprising") {
    return (
      <span className="inline-block h-0 w-[22px] border-t-[1.5px] border-dashed border-[var(--graph-surprising)]" />
    );
  }
  return null;
}

export function KnowledgeGraphPage({ graph, isLoading, onSelectTopic }) {
  const stats = graph?.stats || { nodes: 0, edges: 0, explored: 0 };
  const rawNodes = useMemo(() => graph?.nodes || [], [graph]);
  const rawEdges = useMemo(() => graph?.edges || [], [graph]);

  const [mode, setMode] = useState(/** @type {"overview"|"focus"} */ ("overview"));
  const [focusId, setFocusId] = useState(/** @type {number | null} */ (null));

  const { nodes: visNodes, edges: visEdges } = useMemo(() => {
    if (mode === "focus" && focusId != null) {
      return buildFocusSubgraph(rawNodes, rawEdges, focusId);
    }
    return buildOverviewSubgraph(rawNodes, rawEdges);
  }, [mode, focusId, rawNodes, rawEdges]);

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-6 pb-20 pt-8 md:gap-8 md:px-8">
      <header className="flex flex-col gap-2.5">
        <span className="font-body text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          Knowledge graph
        </span>
        <h1 className="m-0 font-display text-[28px] font-semibold leading-tight text-[var(--ink)]">
          How your explorations hang together
        </h1>
        <p className="m-0 max-w-[40rem] font-body text-[15px] leading-relaxed text-[var(--ink-mid)]">
          Finished topics feed this graph: explored boards as hubs, thematic fields as
          branches, distilled concepts at the endpoints. Browse the overview, then spotlight
          one thread at a time.
        </p>
        <p className="m-0 max-w-[40rem] font-body text-[13px] leading-relaxed text-[var(--ink-faint)]">
          <span className="font-medium text-[var(--ink-mid)]">Tip:</span> Hover isolates ·
          Click focuses · Topic center toggles board / overview
        </p>
      </header>

      <section
        className={cn(
          "graph-canvas relative h-[640px] overflow-hidden rounded-2xl border border-[var(--surface-border)]",
          "shadow-[var(--shadow-sm)]",
        )}
      >
        {rawNodes.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center font-body text-sm text-[var(--ink-muted)]">
            {isLoading
              ? "Loading the map…"
              : "No topics charted yet — drop a topic in the Queue and the Cartographer will map it once it's done."}
          </div>
        ) : (
          <>
            {mode === "focus" && (
              <button
                type="button"
                onClick={() => {
                  setMode("overview");
                  setFocusId(null);
                }}
                className={cn(
                  "absolute left-[18px] top-[18px] z-[3] rounded-[var(--radius-md)] border border-[var(--surface-border)]",
                  "bg-[var(--surface-elevated)] px-3 py-2 font-body text-xs font-semibold text-[var(--ink)]",
                  "shadow-[var(--shadow-sm)] transition-[background-color,border-color] duration-[var(--duration-fast)]",
                  "hover:border-[var(--border-mid)]",
                )}
              >
                ← Overview
              </button>
            )}
            <KnowledgeGraph
              nodes={visNodes}
              edges={visEdges}
              onSelectTopic={onSelectTopic}
              mode={mode}
              focusCenterId={focusId}
              onEnterFocus={(id) => {
                setMode("focus");
                setFocusId(id);
              }}
              onExitFocus={() => {
                setMode("overview");
                setFocusId(null);
              }}
            />
          </>
        )}

        <aside
          aria-label="Graph stats"
          className={cn(
            "pointer-events-none absolute right-[18px] top-[18px] flex min-w-[140px] flex-col gap-1",
            "rounded-xl border border-[var(--surface-border)] bg-[var(--surface-elevated)]/92 p-3 pr-3.5 font-body text-xs",
            "backdrop-blur-sm",
          )}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
            Stats
          </span>
          <StatRow label="Nodes" value={visNodes.length} />
          <StatRow label="Edges" value={visEdges.length} />
          <StatRow label="Explored" value={stats.explored} />
        </aside>

        <aside
          aria-label="Legend"
          className={cn(
            "pointer-events-none absolute bottom-[18px] left-[18px] flex flex-col gap-1.5",
            "rounded-xl border border-[var(--surface-border)] bg-[var(--surface-elevated)]/92 p-3 pr-3.5",
            "backdrop-blur-sm",
          )}
        >
          <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
            Legend
          </span>
          {LEGEND.map((l) => (
            <div
              key={l.type}
              className="flex items-center gap-2.5 font-body text-xs text-[var(--ink-mid)]"
            >
              <span className="inline-grid w-[22px] place-items-center">
                <Swatch kind={l.swatch} />
              </span>
              <span>{l.label}</span>
            </div>
          ))}
        </aside>
      </section>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-[var(--ink-mid)]">{label}</span>
      <span className="font-mono text-[var(--ink)]">{value}</span>
    </div>
  );
}
