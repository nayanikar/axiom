import { Activity, ExternalLink, Menu } from "lucide-react";

import { cn } from "@/lib/utils";

const railBtnClass = cn(
  "inline-flex size-[34px] items-center justify-center rounded-[var(--radius-md)]",
  "border border-[var(--surface-border)] bg-[var(--surface-elevated)] text-[var(--ink-mid)]",
  "transition-[background-color,border-color,box-shadow] duration-[var(--duration-fast)]",
  "hover:border-[var(--border-mid)]",
);

export default function TopBar({
  spaceStatus,
  onOpenMobileTrail,
  onOpenMobileAgents,
  agentsPaused = false,
  onAgentsPausedChange,
  pausePending = false,
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex min-h-12 items-center gap-3 px-4",
        "border-b border-[var(--surface-border)]",
        "bg-[var(--bg-raised)]/95 backdrop-blur-md",
      )}
    >
      <button
        type="button"
        aria-label="Open queue"
        onClick={onOpenMobileTrail}
        className={cn(railBtnClass, "md:hidden")}
      >
        <Menu size={16} />
      </button>

      <div className="min-w-2 flex-1" aria-hidden />

      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2"
          title={
            agentsPaused
              ? "Agents paused — no API calls until you resume"
              : "Pause teachers and cartographer to save API usage"
          }
        >
          <span
            className={cn(
              "hidden text-[10px] font-medium tracking-wide sm:inline",
              agentsPaused ? "text-[var(--accent)]" : "text-[var(--ink-muted)]",
            )}
          >
            {agentsPaused ? "On coffee break" : "Coffee break"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={agentsPaused}
            aria-label={agentsPaused ? "Resume agents" : "Pause agents — coffee break"}
            disabled={pausePending}
            onClick={() => onAgentsPausedChange?.(!agentsPaused)}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full border-0 p-0",
              "transition-colors duration-[var(--duration-fast)]",
              agentsPaused ? "bg-[var(--accent)]" : "bg-[var(--ink-ghost)]",
              pausePending ? "cursor-wait" : "cursor-pointer",
            )}
          >
            <span
              className={cn(
                "absolute top-[3px] size-[18px] rounded-full bg-[var(--bg-raised)] shadow-sm",
                "transition-[left] duration-[var(--duration-normal)]",
                agentsPaused ? "left-[23px]" : "left-[3px]",
              )}
            />
          </button>
        </div>

        {spaceStatus?.observatory_url && (
          <a
            href={spaceStatus.observatory_url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "hidden items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--surface-border)]",
              "bg-[var(--surface-elevated)] px-2.5 py-1.5 font-body text-xs font-medium text-[var(--ink)] sm:inline-flex",
              "transition-colors duration-[var(--duration-fast)] hover:border-[var(--border-mid)]",
            )}
          >
            Observatory
            <ExternalLink size={12} />
          </a>
        )}

        <button
          type="button"
          aria-label="Open agent activity"
          onClick={onOpenMobileAgents}
          className={cn(railBtnClass, "xl:hidden")}
        >
          <Activity size={16} />
        </button>
      </div>
    </header>
  );
}
