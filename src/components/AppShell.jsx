import { X } from "lucide-react";
import { useState } from "react";

import AgentActivityPanel from "@/components/AgentActivityPanel";
import QueueList from "@/components/QueueList";
import { cn } from "@/lib/utils";

export function AppShell({
  topics,
  agents,
  currentId,
  onSelect,
  onNew,
  onOpenBindingDialog,
  spaceStatus,
  topBar,
  children,
  view,
  onChangeView,
}) {
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [mobileAgentsOpen, setMobileAgentsOpen] = useState(false);
  const [prevCurrentId, setPrevCurrentId] = useState(currentId);
  if (currentId !== prevCurrentId) {
    setPrevCurrentId(currentId);
    setMobileQueueOpen(false);
  }

  const queueProps = {
    topics,
    currentId,
    onSelect,
    onNew,
    onOpenBindingDialog,
    spaceStatus,
    view,
    onChangeView: onChangeView
      ? (v) => {
          onChangeView(v);
          setMobileQueueOpen(false);
        }
      : undefined,
  };

  const agentsProps = { agents };

  return (
    <div
      className={cn(
        "flex min-h-screen text-[var(--ink)]",
        "bg-[var(--bg-subtle)]",
      )}
    >
      <div
        className={cn(
          "hidden md:flex md:h-[100dvh] md:max-h-[100dvh] md:w-[var(--rail-width)] md:shrink-0 md:flex-col md:overflow-hidden md:self-start md:sticky md:top-0",
          "border-r border-[var(--surface-border)] bg-[var(--bg-subtle)]",
        )}
      >
        <QueueList {...queueProps} />
      </div>

      {mobileQueueOpen && (
        <div
          className="fixed inset-0 z-40 flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Queue"
        >
          <button
            type="button"
            className="ax-backdrop absolute inset-0 cursor-default border-0 p-0"
            onClick={() => setMobileQueueOpen(false)}
            aria-label="Close queue overlay"
          />
          <div
            className={cn(
              "ax-sheet-left relative flex h-full min-h-0 w-[min(80vw,320px)] max-w-full flex-col",
              "bg-[var(--bg-subtle)] shadow-[var(--shadow-md)]",
            )}
          >
            <div className="flex shrink-0 justify-end p-2">
              <button
                type="button"
                aria-label="Close queue"
                onClick={() => setMobileQueueOpen(false)}
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-[var(--radius-md)]",
                  "border border-[var(--surface-border)] bg-[var(--bg-raised)] text-[var(--ink-mid)]",
                  "transition-colors duration-[var(--duration-fast)] hover:bg-[var(--bg-subtle)]",
                )}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <QueueList {...queueProps} />
            </div>
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          "bg-[var(--bg-raised)] md:my-2 md:mr-1 md:ml-0 md:rounded-2xl md:border md:border-[var(--surface-border)] md:shadow-[var(--shadow-sm)]",
        )}
      >
        {typeof topBar === "function"
          ? topBar({
              onOpenMobileTrail: () => setMobileQueueOpen(true),
              onOpenMobileAgents: () => setMobileAgentsOpen(true),
            })
          : topBar}
        <main
          id="main-content"
          className="min-h-0 flex-1 overflow-y-auto scroll-smooth bg-[var(--bg-raised)] md:rounded-b-2xl"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>

      <div
        className={cn(
          "hidden xl:flex xl:w-[var(--rail-width)] xl:shrink-0 xl:flex-col",
          "border-l border-[var(--surface-border)] bg-[var(--bg-subtle)]",
        )}
      >
        <AgentActivityPanel {...agentsProps} />
      </div>

      {mobileAgentsOpen && (
        <div
          className="fixed inset-0 z-40 flex justify-end xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Agent activity"
        >
          <button
            type="button"
            className="ax-backdrop absolute inset-0 cursor-default border-0 p-0"
            onClick={() => setMobileAgentsOpen(false)}
            aria-label="Close agents overlay"
          />
          <div
            className={cn(
              "ax-sheet-right relative flex h-full w-[min(85vw,340px)] max-w-full flex-col",
              "bg-[var(--bg-subtle)] shadow-[var(--shadow-md)]",
            )}
          >
            <div className="flex justify-end p-2">
              <button
                type="button"
                aria-label="Close agent activity"
                onClick={() => setMobileAgentsOpen(false)}
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-[var(--radius-md)]",
                  "border border-[var(--surface-border)] bg-[var(--bg-raised)] text-[var(--ink-mid)]",
                  "transition-colors duration-[var(--duration-fast)] hover:bg-[var(--bg-subtle)]",
                )}
              >
                <X size={18} />
              </button>
            </div>
            <AgentActivityPanel {...agentsProps} />
          </div>
        </div>
      )}
    </div>
  );
}
