import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "How does the immune system work?",
  "What is entropy?",
  "How do black holes form?",
  "What is the prisoner's dilemma?",
  "How does CRISPR work?",
  "What is stoicism?",
];

export default function Composer({
  onSubmit,
  loading,
  autoFocus = false,
  variant = "full",
  placeholder = "Ask anything — seven agents will pick it up.",
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);
  const compact = variant === "compact";

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function submit() {
    const topic = value.trim();
    if (!topic || loading) return;
    setValue("");
    onSubmit?.(topic);
    inputRef.current?.focus();
  }

  return (
    <div className={cn("flex w-full flex-col gap-3", compact ? "gap-2" : "gap-3.5")}>
      {!compact && (
        <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          Add to queue
        </span>
      )}

      <div
        className={cn(
          "composer-field flex items-center gap-2 rounded-[var(--radius-lg)] border-[1.5px] border-[var(--surface-border)] bg-[var(--surface-elevated)]",
          compact ? "px-3 py-1.5" : "px-2.5 py-2.5 pl-4",
        )}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          aria-label="Topic"
          className={cn(
            "min-w-0 flex-1 border-0 bg-transparent font-body text-[var(--ink)] placeholder:text-[var(--ink-ghost)] focus:outline-none",
            compact ? "text-sm" : "text-base",
          )}
        />
        <button
          type="button"
          onClick={submit}
          disabled={loading || !value.trim()}
          aria-label="Add topic"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border-0 font-body font-medium text-[var(--bg-raised)]",
            "transition-[background-color,opacity] duration-[var(--duration-fast)]",
            compact ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
            loading || !value.trim()
              ? "cursor-not-allowed bg-[var(--ink-ghost)]"
              : "bg-[var(--ink)] hover:bg-[var(--ink-mid)]",
          )}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              {!compact && "Add"}
              <ArrowRight className={compact ? "size-3.5" : "size-4"} />
            </>
          )}
        </button>
      </div>

      {!compact && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested topics">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setValue(s);
                inputRef.current?.focus();
              }}
              className={cn(
                "rounded-full border border-[var(--surface-border)] bg-[var(--surface-elevated)] px-3 py-1.5",
                "font-body text-xs text-[var(--ink-mid)] transition-colors duration-[var(--duration-fast)]",
                "hover:border-[var(--border-mid)] hover:text-[var(--ink)]",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
