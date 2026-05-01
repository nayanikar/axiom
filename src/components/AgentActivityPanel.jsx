import { Activity, ChevronDown } from "lucide-react";
import { useState } from "react";

const TEACHER_META = [
  { id: "anchor",     name: "Anchor",     role: "Foundations", avatar: "An", color: "var(--teacher-anchor)" },
  { id: "analogy",    name: "Analogy",    role: "Story",       avatar: "Aa", color: "var(--teacher-analogy)" },
  { id: "historian",  name: "Historian",  role: "Origins",     avatar: "Hi", color: "var(--teacher-historian)" },
  { id: "challenger", name: "Challenger", role: "Friction",    avatar: "Ch", color: "var(--teacher-challenger)" },
  { id: "connector",  name: "Connector",  role: "Bridges",     avatar: "Co", color: "var(--teacher-connector)" },
  { id: "practical",  name: "Practical",  role: "Application", avatar: "Pr", color: "var(--teacher-practical)" },
  { id: "quiz",       name: "Quiz",       role: "Recall",      avatar: "Qz", color: "var(--teacher-quiz)" },
];

const TEACHER_BY_ID = Object.fromEntries(TEACHER_META.map((t) => [t.id, t]));

const STATUS_COLOR = {
  sleeping: "var(--ink-muted)",
  scanning: "var(--status-claimed)",
  working:  "var(--status-responding)",
};

function relTime(date) {
  if (!date) return "—";
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 1500) return "just now";
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

function AgentRow({ agent }) {
  const teacher = TEACHER_BY_ID[agent.teacher_id];
  const [open, setOpen] = useState(false);
  if (!teacher) return null;
  const dot = STATUS_COLOR[agent.status] || STATUS_COLOR.sleeping;
  const working = agent.status === "working";

  return (
    <li
      data-agent={agent.teacher_id}
      style={{
        background: "var(--surface-elevated)",
        border: "1px solid var(--surface-border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "10px 12px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          color: "var(--ink)",
          fontFamily: "var(--font-body)",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            background: teacher.color,
            color: "white",
            fontSize: 10,
            fontWeight: 700,
            flexShrink: 0,
            position: "relative",
          }}
        >
          {teacher.avatar}
          {working && (
            <span
              className="pulse-dot"
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 999,
                background: teacher.color,
                opacity: 0.4,
              }}
            />
          )}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--ink)",
              lineHeight: 1.2,
            }}
          >
            {teacher.name}
          </span>
          <span
            style={{
              fontSize: 10,
              color: "var(--ink-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            {agent.status}
          </span>
        </span>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: dot,
            flexShrink: 0,
          }}
        />
        <ChevronDown
          size={13}
          style={{
            color: "var(--ink-muted)",
            transition: "transform 120ms ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            flexShrink: 0,
          }}
        />
      </button>

      {open && (
        <div
          style={{
            padding: "0 12px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ink-mid)",
          }}
        >
          <Row label="last poll">{relTime(agent.last_poll_at)}</Row>
          <Row label="calls">
            {agent.calls_today}/{agent.daily_cap}
          </Row>
          {agent.last_picked_topic_id && (
            <Row label="picked">
              <span
                style={{
                  color: "var(--ink)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {String(agent.last_picked_topic_id).slice(0, 12)}…
              </span>
            </Row>
          )}
          {agent.last_action && (
            <Row label="action">
              <span style={{ color: "var(--ink)" }}>{agent.last_action}</span>
            </Row>
          )}
        </div>
      )}
    </li>
  );
}

function Row({ label, children }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-body)",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--ink-muted)",
        }}
      >
        {label}
      </span>
      <span style={{ color: "var(--ink-mid)" }}>{children}</span>
    </div>
  );
}

export default function AgentActivityPanel({ agents = [] }) {
  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: 12,
        padding: 16,
    background: "var(--surface-app)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Activity size={13} style={{ color: "var(--ink-muted)" }} />
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--ink-muted)",
          }}
        >
          Agent activity
        </span>
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          overflowY: "auto",
          flex: 1,
        }}
      >
        {agents.map((a) => (
          <AgentRow key={a.teacher_id} agent={a} />
        ))}
      </ul>
    </aside>
  );
}
