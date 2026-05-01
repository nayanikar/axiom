import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const fieldClass =
  "w-full rounded-[var(--radius-md)] border-[1.5px] border-[var(--surface-border)] bg-[var(--surface-elevated)] px-3 py-2.5 font-mono text-[13px] text-[var(--ink)] outline-none transition-[border-color,box-shadow] duration-[var(--duration-fast)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

const labelClass =
  "font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]";

export function SpaceBindingDialog({ open, onOpenChange, status }) {
  const [claimUrl, setClaimUrl] = useState("");
  const serverAgentName = status?.agent_name;
  const [agentName, setAgentName] = useState(() => serverAgentName || "todd");
  const [prevServerAgentName, setPrevServerAgentName] = useState(serverAgentName);
  if (serverAgentName !== prevServerAgentName) {
    setPrevServerAgentName(serverAgentName);
    if (serverAgentName) setAgentName(serverAgentName);
  }
  const [error, setError] = useState(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onOpenChange?.(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const claim = useMutation({
    mutationFn: async () => {
      setError(null);
      const result = await api.claimSpace(
        claimUrl.trim(),
        agentName.trim() || undefined
      );
      if (!result.ok) {
        throw new Error(`${result.status}: ${result.message || "Claim failed"}`);
      }
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["space-status"] });
      onOpenChange?.(false);
    },
    onError: (err) => setError(err?.message || String(err)),
  });

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="binding-title"
      className={cn(
        "fixed inset-0 z-[60] flex items-center justify-center p-5",
        "ax-backdrop backdrop-blur-sm",
      )}
      onClick={() => onOpenChange?.(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative flex w-full max-w-[480px] flex-col gap-[18px] rounded-[var(--radius-lg)] border border-[var(--surface-border)]",
          "bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-md)]",
        )}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={() => onOpenChange?.(false)}
          className={cn(
            "absolute right-3 top-3 grid size-11 place-items-center rounded-[var(--radius-sm)] border-0",
            "bg-transparent text-[var(--ink-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink)]",
          )}
        >
          <X size={18} />
        </button>

        <div className="flex flex-col gap-2.5 pr-10">
          <h2
            id="binding-title"
            className="m-0 font-display text-2xl font-semibold leading-tight tracking-tight text-[var(--ink)]"
          >
            Bind to an Intent Space
          </h2>
          <dl className="m-0 space-y-2.5 font-body text-[13px] leading-relaxed text-[var(--ink-mid)]">
            <div>
              <dt className="font-semibold text-[var(--ink)]">
                What does “Simulated” mean?
              </dt>
              <dd className="m-0 mt-0.5 pl-0">
                The teachers still run locally. They simply are not wired to your Spacebase1 space yet, so coordinated work stays on this machine and you will not see those intents in Observatory.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--ink)]">
                If I paste my claim URL and choose Bind space, then what happens?
              </dt>
              <dd className="m-0 mt-0.5 pl-0">
                The app validates the URL with Spacebase1, saves the binding, and switches to live mode. Agents then post intents to that space; when the backend exposes one you will get an Observatory link here to inspect INTENT → PROMISE → COMPLETE traffic.
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Claim URL</span>
            <input
              autoFocus
              value={claimUrl}
              onChange={(e) => setClaimUrl(e.target.value)}
              placeholder="https://spacebase1.differ.ac/claim/space-…/token"
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Agent name</span>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className={fieldClass}
              aria-invalid={error ? true : undefined}
            />
          </label>
        </div>

        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--surface-border)] bg-[var(--surface-muted)] p-3">
          <div className="flex items-center gap-2 font-body text-xs text-[var(--ink-mid)]">
            <span>Current state:</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                status?.connected
                  ? "text-[var(--status-done)] bg-[color-mix(in_srgb,var(--status-done)_15%,transparent)]"
                  : "text-[var(--status-responding)] bg-[color-mix(in_srgb,var(--status-responding)_15%,transparent)]",
              )}
            >
              {status?.connected ? "Live" : "Simulated"}
            </span>
          </div>
          {status?.connected && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 font-mono text-[11px] text-[var(--ink-mid)]">
              {status.space_id && (
                <li>
                  <span className="text-[var(--ink-muted)]">space_id </span>
                  <span className="text-[var(--ink)]">{status.space_id}</span>
                </li>
              )}
              {status.agent_name && (
                <li>
                  <span className="text-[var(--ink-muted)]">agent_name </span>
                  <span className="text-[var(--ink)]">{status.agent_name}</span>
                </li>
              )}
              {status.observatory_url && (
                <li>
                  <a
                    href={status.observatory_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body font-medium text-[var(--accent)] no-underline"
                  >
                    Open Observatory →
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,#EF4444_30%,transparent)] bg-[#FEF2F2] p-3 font-body text-xs leading-relaxed text-[#EF4444] break-words"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={() => onOpenChange?.(false)}
            className={cn(
              "rounded-[var(--radius-md)] border border-transparent bg-transparent px-4 py-2.5",
              "font-body text-[13px] font-medium text-[var(--ink-mid)] transition-colors duration-[var(--duration-fast)] hover:text-[var(--ink)]",
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => claim.mutate()}
            disabled={!claimUrl.trim() || claim.isPending}
            className={cn(
              "inline-flex items-center gap-2 rounded-[var(--radius-md)] border-0 px-[18px] py-2.5 font-body text-[13px] font-semibold text-white",
              "transition-[background-color,opacity] duration-[var(--duration-fast)]",
              !claimUrl.trim() || claim.isPending
                ? "cursor-not-allowed bg-[var(--ink-ghost)]"
                : "cursor-pointer bg-[var(--accent)] hover:bg-[var(--accent-hover)]",
            )}
          >
            {claim.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Bind space
          </button>
        </div>
      </div>
    </div>
  );
}
