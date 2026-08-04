"use client";

import { useState } from "react";
import type { AuditActorOption, ResolvedAuditRow } from "@/bcs/audit-compliance";
import { AppState, Badge, type BadgeProps } from "@/shared/ui";
import { FilterBar } from "./filter-bar";
import { hasActiveFilters, type AuditLogFilterState } from "./filter-params";
import { EventDetailDrawer } from "./event-detail-drawer";
import { ExportControl } from "./export-control";

export interface AuditLogViewProps {
  rows: ResolvedAuditRow[];
  total: number;
  page: number;
  pageSize: number;
  retentionDays: number;
  resourceOptions: string[];
  actorOptions: AuditActorOption[];
  filters: AuditLogFilterState;
  onFiltersChange: (next: Partial<AuditLogFilterState>) => void;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
}

/**
 * Mirrors `audit-compliance/domain/audit-event.ts`'s `getAuditActionVerb` /
 * `AUDIT_ACTION_VERB_COLORS` exactly — duplicated (not imported) on
 * purpose: importing any real (non-type) value from that BC's barrel in a
 * client component pulls its whole server-side dependency graph
 * (`postgres`, `drizzle-orm`) into the browser bundle and fails the Next.js
 * build. Same pattern as `settings/api-keys/issue-key-drawer.tsx`.
 */
function getAuditActionVerb(action: string): string {
  return action.includes(".") ? action.slice(action.lastIndexOf(".") + 1) : action;
}

const AUDIT_ACTION_VERB_COLORS: Record<string, string> = {
  created: "green",
  updated: "blue",
  deleted: "red",
  revoked: "red",
  reparented: "violet",
  shared: "violet",
  accepted: "green",
  login: "green",
  logout: "neutral",
  login_failed: "red",
  synced: "violet",
  pruned: "neutral",
  published: "green",
};

function verbBadgeVariant(action: string): BadgeProps["variant"] {
  const verb = getAuditActionVerb(action);
  const color = AUDIT_ACTION_VERB_COLORS[verb];
  return (color as BadgeProps["variant"]) ?? "neutral";
}

function transportVariant(transport: string): BadgeProps["variant"] {
  switch (transport) {
    case "web":
      return "accent";
    case "api":
      return "blue";
    case "cli":
      return "violet";
    default:
      return "neutral";
  }
}

export function AuditLogView({
  rows,
  total,
  page,
  pageSize,
  retentionDays,
  resourceOptions,
  actorOptions,
  filters,
  onFiltersChange,
  onClearFilters,
  onPageChange,
}: AuditLogViewProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const selectedRow = rows.find((r) => r.event.id === selectedEventId) ?? null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const shownFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const shownTo = total === 0 ? 0 : shownFrom + rows.length - 1;
  const filtersActive = hasActiveFilters(filters);
  // `total` is always the *filtered* count (there is no separate unfiltered
  // org-wide count fetched) — disambiguate "org has zero events, ever" from
  // "these filters matched zero" using whether any filter is actually
  // active, not the raw total alone (a real bug caught via manual browser
  // verification: searching for a nonexistent term showed "No audit events
  // yet" instead of "No events match these filters").
  const isEmpty = total === 0 && !filtersActive;
  const isNoMatch = total === 0 && filtersActive;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-6 pb-0">
        <div className="mb-1 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
              Settings · Compliance
            </p>
            <h1 className="font-display text-[21px] font-bold tracking-tight">Audit log</h1>
          </div>
          {/* No export-entitlement key exists yet (billing-entitlements'
              `EntitlementSnapshot` has no such field) — `canExport` stays
              omitted, keeping the control hidden per FR-014, until a future
              feature adds a real key to pass through here. */}
          <ExportControl />
        </div>
        <p className="mb-4 max-w-[560px] text-[12.5px] leading-relaxed text-dim">
          Every mutation across the workspace, captured in-transaction on the web app, REST
          API, and CLI. Admin-only.
        </p>
        <FilterBar
          filters={filters}
          resourceOptions={resourceOptions}
          actorOptions={actorOptions}
          onChange={onFiltersChange}
          onClear={onClearFilters}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isEmpty || isNoMatch ? (
          <AppState
            variant="empty"
            title={isEmpty ? "No audit events yet" : "No events match these filters"}
            description={
              isEmpty
                ? "As soon as anyone changes a policy, project, key, or team, the change is captured here in the same transaction."
                : "Try a broader resource type, a different actor, or clear the search to see the full trail."
            }
            action={
              isNoMatch && filtersActive ? (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="rounded-control border border-border-2 bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text"
                >
                  Clear filters
                </button>
              ) : null
            }
          />
        ) : (
          <div>
            {rows.map((row) => (
              <button
                key={row.event.id}
                type="button"
                onClick={() => setSelectedEventId(row.event.id)}
                className="grid w-full grid-cols-[150px_1fr_190px_100px] items-center gap-3.5 border-b border-border px-6 py-3 text-left hover:bg-surface"
              >
                <div>
                  <div className="font-mono text-[12px] text-text">
                    {row.event.createdAt.toLocaleString()}
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2.5">
                  <Badge dot variant={verbBadgeVariant(row.event.action)}>
                    {row.event.action}
                  </Badge>
                  <span className="truncate font-mono text-[12.5px] text-text">
                    {row.resourceDisplayName}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`grid size-6 flex-none place-items-center font-mono text-[10px] text-dim ${
                      row.actor.kind === "user" ? "rounded-full" : "rounded-[7px]"
                    } border border-border-2 bg-surface-2`}
                  >
                    {row.actor.kind === "api_key" ? "⌘" : row.actor.kind === "system" ? "⚙" : row.actor.displayName[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[12px] text-text">
                      {row.actor.displayName}
                    </div>
                    <div className="font-mono text-[10px] text-faint">{row.actor.subtitle}</div>
                  </div>
                </div>
                <Badge variant={transportVariant(row.event.transport)}>{row.event.transport}</Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      {!isEmpty ? (
        <div className="flex items-center justify-between gap-4 border-t border-border bg-panel px-6 py-3">
          <div className="font-mono text-[11.5px] text-faint">
            Showing <span className="text-text">{shownFrom}–{shownTo}</span> of{" "}
            <span className="text-text">{total}</span> events{" "}
            <span className="text-faint">· retention {retentionDays} days</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded-control border border-border px-2.5 py-1.5 font-mono text-[12px] text-dim disabled:opacity-40"
            >
              Prev
            </button>
            <span className="font-mono text-[12px] text-faint">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded-control border border-border px-2.5 py-1.5 font-mono text-[12px] text-dim disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {selectedRow ? (
        <EventDetailDrawer row={selectedRow} onClose={() => setSelectedEventId(null)} />
      ) : null}
    </main>
  );
}
