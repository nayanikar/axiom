import { Compass, GitBranch, Inbox, Network, Plus, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

const TEACHER_ORDER = [
  "anchor",
  "analogy",
  "historian",
  "challenger",
  "connector",
  "practical",
  "quiz",
];

/** HSL pastel for SVG / inline — triplet tokens from :root */
function pastelFill(tid) {
  return `hsl(var(--agent-pastel-${tid}) / 1)`;
}

const STATUS_DOT = {
  queued: { color: "var(--status-queued)", label: "Queued", pulse: false },
  claimed: { color: "var(--status-claimed)", label: "Claimed", pulse: false },
  responding: { color: "var(--status-responding)", label: "Responding", pulse: true },
  done: { color: "var(--status-done)", label: "Done", pulse: false },
  capped: { color: "var(--ink-faint)", label: "Capped", pulse: false },
  error: { color: "var(--status-error)", label: "Error", pulse: false },
};

function relativeTime(date) {
  if (!date) return "";
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function SparkTrail({ doneIds = [], respondingIds = [] }) {
  const doneKeys = Array.isArray(doneIds) ? doneIds : [];
  const workingKeys = Array.isArray(respondingIds) ? respondingIds : [];
  const doneSet = new Set(doneKeys);
  const workingSet = new Set(workingKeys);

  const W = 88;
  const positions = [0.04, 0.19, 0.34, 0.49, 0.64, 0.79, 0.94];

  return (
    <svg
      width={W + 8}
      height={12}
      className="block overflow-visible"
      aria-hidden
    >
      <line
        x1={0}
        y1={5}
        x2={W + 8}
        y2={5}
        stroke="rgba(100,98,110,0.15)"
        strokeWidth={0.8}
      />

      {positions.map((p, i) => {
        if (i === 0) return null;
        const prevKey = TEACHER_ORDER[i - 1];
        const currKey = TEACHER_ORDER[i];
        if (!doneSet.has(prevKey) || !doneSet.has(currKey)) return null;
        const x1 = positions[i - 1] * W + 6.8;
        const x2 = p * W + 1.2;
        return (
          <line
            key={`line-${i}`}
            x1={x1}
            y1={5}
            x2={x2}
            y2={5}
            stroke={pastelFill(currKey)}
            strokeWidth={0.7}
            opacity={0.3}
          />
        );
      })}

      {positions.map((p, i) => {
        const key = TEACHER_ORDER[i];
        const x = p * W + 4;
        const color = pastelFill(key);
        const isDone = doneSet.has(key);
        const isActive = workingSet.has(key);

        if (!isDone && !isActive) {
          return (
            <circle key={key} cx={x} cy={5} r={1.8} fill={color} opacity={0.22} />
          );
        }
        if (isActive) {
          return (
            <g key={key}>
              <circle cx={x} cy={5} r={2.8} fill={color} opacity={0.45}>
                <animate
                  attributeName="opacity"
                  values="0.45;0.15;0.45"
                  dur="1.4s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle cx={x} cy={5} r={5} fill={color} opacity={0.12}>
                <animate
                  attributeName="r"
                  values="3;7;3"
                  dur="1.4s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.12;0;0.12"
                  dur="1.4s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          );
        }
        return <circle key={key} cx={x} cy={5} r={2.8} fill={color} opacity={0.88} />;
      })}
    </svg>
  );
}

export default function QueueList({
  topics = [],
  currentId,
  onSelect,
  onNew,
  onOpenBindingDialog,
  spaceStatus,
  view = "queue",
  onChangeView,
}) {
  const connected = spaceStatus?.connected;

  const byId = new Map(topics.map((t) => [t.id, t]));
  const consumed = new Set();
  const rendered = [];
  for (const t of topics) {
    if (consumed.has(t.id)) continue;
    if (t.source === "agent-trace" && t.parent_topic_id && byId.has(t.parent_topic_id)) {
      continue;
    }
    rendered.push({ ...t, _children: [] });
    consumed.add(t.id);
  }
  const flat = [];
  for (const parent of rendered) {
    flat.push({ ...parent, _depth: 0 });
    const children = topics.filter(
      (c) => c.source === "agent-trace" && c.parent_topic_id === parent.id
    );
    for (const c of children) flat.push({ ...c, _depth: 1 });
  }
  for (const t of topics) {
    if (flat.find((f) => f.id === t.id)) continue;
    flat.push({ ...t, _depth: 0 });
  }

  const asideInner = (
    <>
      <div className="border-b border-[var(--surface-border)] px-5 pb-4 pt-6">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="grid size-7 flex-shrink-0 place-items-center rounded-lg bg-[var(--accent)]">
            <Sparkles size={14} className="text-white" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight text-[var(--ink)]">
            Axiom
          </span>
        </div>

        <nav className="flex flex-col gap-0.5" aria-label="Primary">
          <button
            type="button"
            aria-current={view === "queue" ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg border-0 px-2.5 py-2 text-left font-body text-sm",
              "transition-[background-color,color] duration-[var(--duration-fast)]",
              view === "queue"
                ? "bg-[var(--bg-subtle)] font-semibold text-[var(--ink)]"
                : "bg-transparent font-normal text-[var(--ink-mid)] hover:bg-[var(--bg-subtle)]/60",
            )}
            onClick={() => {
              onChangeView?.("queue");
            }}
          >
            <Compass size={16} className="flex-shrink-0" />
            Boards
          </button>
          <button
            type="button"
            aria-current={view === "graph" ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg border-0 px-2.5 py-2 text-left font-body text-sm",
              "transition-[background-color,color] duration-[var(--duration-fast)]",
              view === "graph"
                ? "bg-[var(--bg-subtle)] font-semibold text-[var(--ink)]"
                : "bg-transparent font-normal text-[var(--ink-mid)] hover:bg-[var(--bg-subtle)]/60",
            )}
            onClick={() => onChangeView?.("graph")}
          >
            <Network size={16} className="flex-shrink-0" />
            Knowledge graph
          </button>
        </nav>
      </div>

      <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-5">
        <span className="font-body text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-mid)]">
          Learning trail
        </span>
        <button
          type="button"
          aria-label="New topic"
          onClick={onNew}
          className={cn(
            "grid size-11 place-items-center rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--ink-mid)_18%,transparent)]",
            "bg-transparent text-[var(--ink-mid)] transition-[background-color,border-color] duration-[var(--duration-fast)]",
            "hover:border-[var(--border-mid)] hover:bg-[var(--bg-subtle)]",
          )}
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="flex flex-col gap-0.5 px-3 pb-2 pt-1">
          {topics.length === 0 && (
            <div
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--ink-mid)_25%,transparent)]",
                "p-6 text-center font-body text-xs text-[var(--ink-mid)]",
              )}
            >
              <Inbox size={18} className="opacity-60" />
              Drop a topic — agents pick them up on their own.
            </div>
          )}

          <ul className="m-0 list-none p-0">
            {flat.map((t, rowIndex) => {
              const meta = STATUS_DOT[t.status] || STATUS_DOT.queued;
              const active = t.id === currentId;
              const total = 7;
              const done = t.done_teacher_ids?.length ?? 0;
              const isTrace = t.source === "agent-trace";
              const depth = t._depth ?? 0;
              const rowNum = String(flat.length - rowIndex).padStart(2, "0");
              const responding = Array.isArray(t.responding_teacher_ids) ? t.responding_teacher_ids : [];

              const metaDotColor =
                done >= total
                  ? pastelFill("analogy")
                  : responding.length > 0
                    ? pastelFill("historian")
                    : "rgba(120,118,130,0.3)";

              const rowPadLeft = depth ? 22 : 0;

              return (
                <li key={t.id} className="mb-1" style={{ paddingLeft: rowPadLeft }}>
                  <button
                    type="button"
                    data-topic={t.id}
                    onClick={() => onSelect?.(t.id)}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left font-body",
                      "text-[var(--ink)] transition-[background-color,border-color] duration-[var(--duration-fast)]",
                      active
                        ? "border-[color-mix(in_srgb,var(--ink)_16%,transparent)] bg-[color-mix(in_srgb,var(--ink)_7%,transparent)]"
                        : "border-transparent bg-transparent hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]",
                    )}
                  >
                    <div className="flex w-full items-start gap-2.5">
                      <span
                        className={cn(
                          "mt-0.5 min-w-[18px] flex-shrink-0 font-mono text-[10px]",
                          active ? "text-[var(--ink-mid)]" : "text-[var(--ink-ghost)]",
                        )}
                      >
                        {rowNum}
                      </span>

                      <div className="flex min-w-0 flex-1 items-start gap-1.5">
                        {meta.pulse ? (
                          <span
                            className="pulse-dot mt-1 size-[7px] flex-shrink-0 rounded-full"
                            style={{ background: meta.color }}
                            aria-label={meta.label}
                          />
                        ) : (
                          <span
                            className="mt-1 size-[7px] flex-shrink-0 rounded-full opacity-85"
                            style={{ background: meta.color }}
                            aria-hidden
                          />
                        )}
                        {isTrace && (
                          <GitBranch
                            size={13}
                            className="mt-0.5 flex-shrink-0 text-[hsl(var(--sidebar-primary))]"
                            aria-hidden
                          />
                        )}
                        <span
                          className={cn(
                            "line-clamp-2 flex-1 text-[13px] leading-snug text-[var(--ink)]",
                            active ? "font-semibold" : "font-normal",
                          )}
                        >
                          {t.text}
                        </span>
                        <span className="flex-shrink-0 font-mono text-[10px] text-[var(--ink-ghost)]">
                          {done}/{total}
                        </span>
                      </div>
                    </div>

                    <div className="pl-[38px]">
                      <SparkTrail
                        doneIds={t.done_teacher_ids}
                        respondingIds={t.responding_teacher_ids}
                      />
                    </div>

                    <div className="flex items-center gap-1.5 pl-[38px]">
                      <span
                        className="size-1.5 flex-shrink-0 rounded-full"
                        style={{ background: metaDotColor }}
                      />
                      <span className="font-mono text-[10px] text-[var(--ink-mid)]">
                        {done}/{total} agents · {relativeTime(t.created_at)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div
        className={cn(
          "mx-3 mb-3 mt-2 shrink-0 rounded-xl border border-[color-mix(in_srgb,var(--ink-mid)_16%,transparent)]",
          "bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-3",
        )}
      >
        <div className="mb-2 font-body text-[9px] font-semibold uppercase tracking-[0.12em] text-[color-mix(in_srgb,var(--ink)_42%,transparent)]">
          Intent Space
        </div>
        <button
          type="button"
          onClick={onOpenBindingDialog}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent py-1 text-left font-body text-[11px] text-[var(--ink)]",
            "transition-opacity duration-[var(--duration-fast)] hover:opacity-90",
          )}
        >
          <span
            className="size-2 flex-shrink-0 rounded-full"
            style={{
              background: connected ? pastelFill("analogy") : `hsl(var(--sidebar-primary) / 0.85)`,
            }}
          />
          <span className="flex-1 font-mono">
            {connected ? "Live · agents posting" : "Simulated mode"}
          </span>
        </button>
        {spaceStatus?.observatory_url && (
          <a
            href={spaceStatus.observatory_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 block font-body text-xs font-medium text-[hsl(var(--sidebar-primary))] no-underline"
          >
            Open Observatory →
          </a>
        )}
      </div>
    </>
  );

  return (
    <aside
      className={cn(
        "newsprint-queue-rail flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-subtle)] text-[var(--ink)]",
      )}
    >
      {asideInner}
    </aside>
  );
}
