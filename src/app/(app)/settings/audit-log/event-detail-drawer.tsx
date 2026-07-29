"use client";

import type { ResolvedAuditRow } from "@/bcs/audit-compliance";
import { diffOf } from "./diff";

export interface EventDetailDrawerProps {
  row: ResolvedAuditRow;
  onClose: () => void;
}

/**
 * Mirrors `audit-compliance/domain/audit-event.ts`'s `getAuditActionVerb`
 * exactly — duplicated (not imported); see `audit-log-view.tsx`'s identical
 * comment for why a client component can't import this from the BC barrel.
 */
function getAuditActionVerb(action: string): string {
  return action.includes(".") ? action.slice(action.lastIndexOf(".") + 1) : action;
}

function isAuthEvent(action: string): boolean {
  const verb = getAuditActionVerb(action);
  return verb === "login" || verb === "logout" || verb === "login_failed";
}

export function EventDetailDrawer({ row, onClose }: EventDetailDrawerProps) {
  const { event, resourceDisplayName, actor } = row;
  const diff = diffOf(event.before, event.after);
  const hasDiff = diff.length > 0;
  const noDiffLabel = isAuthEvent(event.action)
    ? "Authentication event — no resource state change recorded."
    : "No field-level changes recorded for this event.";

  return (
    <div className="fixed inset-0 z-[100]">
      <div onClick={onClose} className="absolute inset-0 bg-black/60" aria-hidden />
      <div className="absolute inset-y-0 right-0 flex w-[520px] max-w-[94vw] flex-col border-l border-border-2 bg-panel">
        <div className="flex h-14 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[12px] font-semibold text-text">{event.action}</span>
            <span className="font-display text-[15px] font-semibold">{resourceDisplayName}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-7.5 place-items-center rounded-control border border-border text-dim"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5.5 py-5">
          <div className="mb-5.5 grid grid-cols-2 gap-px overflow-hidden rounded-tile border border-border bg-border">
            <div className="bg-surface p-3">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">Actor</div>
              <div className="font-mono text-[12.5px] text-text">{actor.displayName}</div>
              <div className="mt-0.5 font-mono text-[10.5px] text-faint">{actor.subtitle}</div>
            </div>
            <div className="bg-surface p-3">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">Source</div>
              <div className="font-mono text-[12.5px] text-text">{event.transport}</div>
              <div className="mt-0.5 font-mono text-[10.5px] text-faint">{event.sourceIp ?? "—"}</div>
            </div>
            <div className="bg-surface p-3">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">Resource</div>
              <div className="font-mono text-[12.5px] text-text">{event.resourceType}</div>
              <div className="mt-0.5 truncate font-mono text-[10.5px] text-faint">
                {event.resourceId ?? "—"}
              </div>
            </div>
            <div className="bg-surface p-3">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                Timestamp
              </div>
              <div className="font-mono text-[12.5px] text-text">{event.createdAt.toLocaleString()}</div>
            </div>
          </div>

          <div className="mb-2.5 flex items-center gap-2">
            <span className="font-display text-[13px] font-semibold">Change diff</span>
            <span className="flex-1 h-px bg-border" />
            <span className="font-mono text-[10.5px] text-a">redacted secrets omitted</span>
          </div>

          {hasDiff ? (
            <div className="overflow-hidden rounded-tile border border-border font-mono text-[12px]">
              {diff.map((d) => (
                <div key={d.key} className="grid grid-cols-[130px_1fr] border-b border-border last:border-0">
                  <div className="truncate border-r border-border bg-surface-2 p-2.5 text-dim">{d.key}</div>
                  <div className="flex flex-col gap-1 bg-surface p-2.5">
                    {d.before !== null ? (
                      <div className="flex items-start gap-1.5">
                        <span className="flex-none text-red">−</span>
                        <span className="break-words rounded px-1 bg-red-soft text-red">{d.before}</span>
                      </div>
                    ) : null}
                    {d.after !== null ? (
                      <div className="flex items-start gap-1.5">
                        <span className="flex-none text-green">+</span>
                        <span className="break-words rounded px-1 bg-green-soft text-green">{d.after}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-tile border border-dashed border-border-2 p-5 text-center font-mono text-[12px] text-faint">
              {noDiffLabel}
            </div>
          )}

          <div className="mb-2.5 mt-5.5 flex items-center gap-2">
            <span className="font-display text-[13px] font-semibold">Event ID</span>
            <span className="flex-1 h-px bg-border" />
          </div>
          <div className="flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-2.5">
            <span className="flex-1 truncate font-mono text-[12px] text-dim">{event.id}</span>
            <span className="font-mono text-[10.5px] text-faint">immutable</span>
          </div>
        </div>
      </div>
    </div>
  );
}
