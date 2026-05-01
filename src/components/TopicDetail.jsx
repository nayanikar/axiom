import { GitBranch } from "lucide-react";

import Composer from "@/components/Composer";
import TeacherCard from "@/components/TeacherCard";
import { cn } from "@/lib/utils";

const TEACHER_META = [
  { id: "anchor",     name: "Anchor",     role: "Foundations",   avatar: "An", color: "var(--teacher-anchor)" },
  { id: "analogy",    name: "Analogy",    role: "Story",         avatar: "Aa", color: "var(--teacher-analogy)" },
  { id: "historian",  name: "Historian",  role: "Origins",       avatar: "Hi", color: "var(--teacher-historian)" },
  { id: "challenger", name: "Challenger", role: "Friction",      avatar: "Ch", color: "var(--teacher-challenger)" },
  { id: "connector",  name: "Connector",  role: "Bridges",       avatar: "Co", color: "var(--teacher-connector)" },
  { id: "practical",  name: "Practical",  role: "Application",   avatar: "Pr", color: "var(--teacher-practical)" },
  { id: "quiz",       name: "Quiz",       role: "Recall",        avatar: "Qz", color: "var(--teacher-quiz)" },
];

const TEACHER_BY_ID = Object.fromEntries(TEACHER_META.map((t) => [t.id, t]));

const CHAPTER_NAMES = [
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
];

function statusOf(response) {
  if (!response) return "thinking";
  if (response.status === "done") return "done";
  if (response.status === "error") return "error";
  return "thinking";
}

function TableOfContents({ topic }) {
  const responsesByTeacher = Object.fromEntries(
    (topic.responses || []).map((r) => [r.teacher_id, r])
  );
  return (
    <nav
      aria-label="Table of contents"
      className={cn(
        "flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-[var(--surface-border)]",
        "bg-[var(--surface-elevated)] p-5 xl:sticky xl:top-28 xl:max-w-[14rem]",
      )}
    >
      <span className="text-center font-body text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--ink-muted)] xl:text-left">
        Table of Contents
      </span>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {TEACHER_META.map((t, i) => {
          const r = responsesByTeacher[t.id];
          const st = statusOf(r);
          const num = CHAPTER_NAMES[i];
          return (
            <li key={t.id}>
              <a
                href={`#chapter-${t.id}`}
                className={cn(
                  "flex items-baseline gap-3 rounded-[var(--radius-sm)] px-1 py-1.5",
                  "font-book text-sm leading-relaxed text-[var(--ink)] no-underline",
                  "transition-[background-color] duration-[var(--duration-fast)] hover:bg-[var(--bg-subtle)]",
                )}
              >
                <span className="w-14 flex-shrink-0 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                  Ch. {num}
                </span>
                <span className="min-w-0 flex-1 font-display font-semibold text-[var(--ink)]">
                  {t.role}
                </span>
                <span className="font-book text-[13px] italic text-[var(--ink-mid)]">
                  {t.name}
                </span>
                <span
                  aria-hidden
                  className="size-1.5 flex-shrink-0 rounded-full"
                  style={{
                    background:
                      st === "done"
                        ? t.color
                        : st === "error"
                          ? "var(--status-error)"
                          : "var(--ink-ghost)",
                  }}
                />
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function TopicDetail({
  topic,
  observatoryUrl,
  onSelectChild,
  onSubmit,
  composerLoading,
}) {
  if (!topic) return null;

  const responsesByTeacher = Object.fromEntries(
    (topic.responses || []).map((r) => [r.teacher_id, r])
  );

  const spawnedBy =
    topic.spawned_by_teacher_id && TEACHER_BY_ID[topic.spawned_by_teacher_id];
  const children = topic.children || [];

  return (
    <div className="flex flex-col">
      {onSubmit && (
        <div
          className={cn(
            "sticky top-0 z-[5] border-b border-[var(--surface-border)]",
            "bg-[var(--surface-app)]/95 px-6 py-4 backdrop-blur-md",
            "transition-[border-color] duration-[var(--duration-fast)]",
          )}
        >
          <Composer
            variant="compact"
            onSubmit={onSubmit}
            loading={composerLoading}
          />
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[min(65ch+20rem,72rem)] flex-col gap-10 px-7 py-14 md:gap-12 md:px-8">
        {/* Title page */}
        <header className="flex flex-col items-center gap-4 pb-3 text-center">
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <span className="font-body text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--ink-muted)]">
              Topic
            </span>
            {topic.root_intent_id && (
              <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                intent {topic.root_intent_id.slice(0, 12)}…
              </span>
            )}
          </div>

          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-[var(--ink)] md:text-[52px]">
            {topic.text}
          </h1>

          <span className="font-book text-[15px] italic text-[var(--ink-mid)]">
            in seven chapters, by seven minds
          </span>

          {spawnedBy && (
            <span
              data-teacher={spawnedBy.id}
              className="mt-1 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-body text-[11px] font-medium"
              style={{ borderColor: spawnedBy.color, color: spawnedBy.color }}
            >
              <GitBranch size={11} />
              spawned by {spawnedBy.name}
            </span>
          )}

          {observatoryUrl && (
            <a
              href={observatoryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 font-body text-xs font-medium text-[var(--accent)] no-underline"
            >
              Watch in Observatory →
            </a>
          )}
        </header>

        <div className="flex flex-col gap-10 xl:grid xl:grid-cols-[minmax(0,14rem)_minmax(0,65ch)] xl:items-start xl:gap-x-10">
          <div className="mx-auto w-full max-w-md xl:mx-0 xl:max-w-none">
            <TableOfContents topic={topic} />
          </div>

          {/* The book + spawned */}
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-col">
              {TEACHER_META.map((teacher, i) => {
                const response = responsesByTeacher[teacher.id];
                return (
                  <div key={teacher.id} id={`chapter-${teacher.id}`}>
                    <TeacherCard teacher={teacher} response={response} index={i} />
                    {i < TEACHER_META.length - 1 && (
                      <div
                        aria-hidden
                        className="pb-7 text-center text-xs tracking-[0.6em] text-[var(--ink-muted)]"
                      >
                        · · ·
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {children.length > 0 && (
              <section className="mt-8 flex flex-col gap-3.5 border-t border-[var(--surface-border)] pt-8">
                <span className="text-center font-body text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                  Spawned traces
                </span>
                <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 p-0">
                  {children.map((c) => {
                    const teacher = TEACHER_BY_ID[c.spawned_by_teacher_id];
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onSelectChild?.(c.id)}
                          className={cn(
                            "flex w-full cursor-pointer flex-col gap-1.5 rounded-[var(--radius-lg)] border border-[var(--surface-border)]",
                            "bg-[var(--surface-elevated)] p-3.5 text-left",
                            "transition-[border-color] duration-[var(--duration-fast)] hover:border-[var(--border-mid)]",
                          )}
                        >
                          <span
                            className="inline-flex items-center gap-1.5 font-body text-[11px] font-medium"
                            style={{ color: teacher?.color || "var(--ink-faint)" }}
                          >
                            <GitBranch size={11} />
                            {teacher ? `from ${teacher.name}` : "agent-trace"}
                            <span className="text-[var(--ink-muted)]">·</span>
                            <span className="capitalize text-[var(--ink-muted)]">
                              {c.status}
                            </span>
                          </span>
                          <span className="font-book text-sm font-medium leading-snug text-[var(--ink)]">
                            {c.text}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
