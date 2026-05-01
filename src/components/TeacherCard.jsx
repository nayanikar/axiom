import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

const TEACHER_COLOR = {
  anchor: "var(--teacher-anchor)",
  analogy: "var(--teacher-analogy)",
  historian: "var(--teacher-historian)",
  challenger: "var(--teacher-challenger)",
  connector: "var(--teacher-connector)",
  practical: "var(--teacher-practical)",
  quiz: "var(--teacher-quiz)",
};

const CHAPTER_NAMES = [
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
];

function statusFor(response) {
  if (!response) return "thinking";
  if (response.status === "done") return "done";
  if (response.status === "error") return "error";
  return "thinking";
}

function ShimmerLine({ width = "100%" }) {
  return (
    <span
      className="block h-3 rounded bg-[length:200%_100%]"
      style={{
        width,
        background:
          "linear-gradient(90deg, var(--bg-subtle) 0%, var(--bg-deep) 50%, var(--bg-subtle) 100%)",
        animation: "shimmer 1.6s ease-in-out infinite",
      }}
    />
  );
}

export default function TeacherCard({ teacher, response, index = 0 }) {
  const status = statusFor(response);
  const accent = TEACHER_COLOR[teacher.id] || teacher.color || "var(--ink-mid)";
  const stagger = (index % 7) + 1;
  const chapterLabel = CHAPTER_NAMES[index] || String(index + 1);

  return (
    <section
      data-teacher={teacher.id}
      className={cn(`reveal reveal-${stagger} mb-12 scroll-mt-24 md:mb-16`)}
      aria-label={`Chapter ${chapterLabel} — ${teacher.role} by ${teacher.name}`}
    >
      <header className="mb-7 flex flex-col items-center gap-2 text-center md:mb-8">
        <span className="font-body text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--ink-muted)]">
          Chapter {chapterLabel}
        </span>

        <h2 className="m-0 font-display text-[clamp(1.5rem,4vw,1.875rem)] font-semibold leading-[1.15] tracking-tight text-[var(--ink)]">
          {teacher.role}
        </h2>

        <div className="inline-flex items-center gap-2 font-book text-sm italic text-[var(--ink-mid)]">
          <span
            aria-hidden
            className="grid size-4 place-items-center rounded-full font-body text-[8px] font-bold not-italic leading-none tracking-wide text-white"
            style={{ background: accent }}
          >
            {teacher.avatar}
          </span>
          <span>by {teacher.name}</span>
          {response?.intent_id && (
            <span className="font-mono text-[10px] not-italic text-[var(--ink-muted)]">
              · intent {response.intent_id.slice(0, 8)}
            </span>
          )}
        </div>

        <span
          aria-hidden
          className="mt-1.5 block h-0.5 w-9 rounded-sm"
          style={{ background: accent }}
        />
      </header>

      <div className="mx-auto max-w-[65ch]">
        {status === "thinking" && (
          <div
            className="flex flex-col gap-2.5 py-2"
            aria-label="Chapter being written"
          >
            <ShimmerLine width="98%" />
            <ShimmerLine width="92%" />
            <ShimmerLine width="96%" />
            <ShimmerLine width="74%" />
            <span className="mt-2.5 text-center font-book text-[13px] italic text-[var(--ink-muted)]">
              {teacher.name} is writing this chapter…
            </span>
          </div>
        )}

        {status === "error" && (
          <p className="m-0 text-center font-book text-[15px] italic text-[var(--status-error)]">
            {response?.error ||
              `${teacher.name} could not finish this chapter right now.`}
          </p>
        )}

        {status === "done" && response?.text && (
          <article className="prose-book">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {response.text}
            </ReactMarkdown>
          </article>
        )}
      </div>
    </section>
  );
}
