"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AuditActorOption, ResolvedAuditRow } from "@/bcs/audit-compliance";
import { AuditLogView } from "./audit-log-view";
import { parseFilterState, type AuditLogFilterState } from "./filter-params";

export interface AuditLogProps {
  rows: ResolvedAuditRow[];
  total: number;
  page: number;
  pageSize: number;
  retentionDays: number;
  resourceOptions: string[];
  actorOptions: AuditActorOption[];
}

/**
 * Thin client wrapper owning `next/navigation`'s router context — kept
 * separate from `AuditLogView` per this repo's View/wrapper split
 * convention, since a hook requiring real App Router context can't be
 * exercised by this repo's `renderToStaticMarkup`-only test convention.
 * Filter changes are round-tripped through the URL (research.md's
 * filter-persistence decision): updating the query string triggers
 * `page.tsx` to re-run with the new filters, no separate client-side
 * fetch path needed.
 */
export function AuditLog(props: AuditLogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = parseFilterState(Object.fromEntries(searchParams.entries()));

  function navigate(next: AuditLogFilterState) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value) {
        params.set(key, value);
      }
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <AuditLogView
      {...props}
      filters={filters}
      onFiltersChange={(partial) => navigate({ ...filters, ...partial, page: undefined })}
      onClearFilters={() => navigate({})}
      onPageChange={(page) => navigate({ ...filters, page: String(page) })}
    />
  );
}
