import Composer from "@/components/Composer";
import { cn } from "@/lib/utils";

const TEACHER_VARS = {
  anchor: "var(--teacher-anchor)",
  analogy: "var(--teacher-analogy)",
  historian: "var(--teacher-historian)",
  challenger: "var(--teacher-challenger)",
  connector: "var(--teacher-connector)",
  practical: "var(--teacher-practical)",
  quiz: "var(--teacher-quiz)",
};

export default function EmptyState({ teachers = [], onSubmit, loading }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-12 md:gap-10 md:py-16">
      <div className="flex flex-col gap-3.5">
        <span className="font-body text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
          Axiom
        </span>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-[var(--ink-strong)] md:text-4xl">
          Teaching swarm
        </h1>
        <p className="max-w-xl font-body text-[15px] leading-relaxed text-[var(--ink-mid)]">
          Add a topic. Seven agents take turns in a shared Intent Space (Spacebase1), respond with
          Anthropic, and may spawn follow-up intents. When a topic finishes, the cartographer updates
          the knowledge graph.
        </p>
      </div>

      <div className="w-full">
        <Composer onSubmit={onSubmit} loading={loading} variant="full" autoFocus />
      </div>

      <div className="flex flex-col items-center gap-3.5">
        <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          Your teaching swarm
        </span>
        <div
          className="grid w-full gap-8"
          style={{
            gridTemplateColumns: `repeat(${Math.min(teachers.length || 7, 7)}, minmax(0, 1fr))`,
          }}
        >
          {teachers.map((t, i) => (
            <div
              key={t.id}
              data-teacher={t.id}
              className={cn("reveal flex flex-col items-center gap-2", `reveal-${(i % 7) + 1}`)}
            >
              <div
                className="grid size-11 place-items-center rounded-full font-body text-sm font-bold tracking-wide text-white"
                style={{ background: TEACHER_VARS[t.id] || t.color }}
              >
                {t.avatar}
              </div>
              <span className="text-center font-body text-xs font-medium leading-tight text-[var(--ink)]">
                {t.name}
              </span>
              <span className="text-center font-body text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
                {t.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
