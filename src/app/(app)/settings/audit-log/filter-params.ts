import type { AuditEventFilters, AuditTransport } from "@/bcs/audit-compliance";

/**
 * Mirrors `audit-compliance/domain/audit-event.ts`'s `AUDIT_TRANSPORTS`
 * exactly — duplicated (not imported). This module is imported by the
 * client wrapper `audit-log.tsx`, so importing any real value from the BC
 * barrel here would drag its server-only dependencies into the browser
 * bundle; see `audit-log-view.tsx`'s identical comment for the full reason.
 */
export const AUDIT_TRANSPORTS = ["web", "api", "cli", "system"] as const;

export type DateRangePreset = "24h" | "7d" | "30d" | "all" | "custom";

const RANGE_PRESETS: Record<Exclude<DateRangePreset, "all" | "custom">, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
};

export interface AuditLogFilterState {
  q?: string;
  resource?: string;
  actorUserId?: string;
  actorApiKeyId?: string;
  transport?: AuditTransport;
  range?: DateRangePreset;
  from?: string;
  to?: string;
  page?: string;
}

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseFilterState(searchParams: SearchParams): AuditLogFilterState {
  return {
    q: single(searchParams.q),
    resource: single(searchParams.resource),
    actorUserId: single(searchParams.actorUserId),
    actorApiKeyId: single(searchParams.actorApiKeyId),
    transport: single(searchParams.transport) as AuditTransport | undefined,
    range: single(searchParams.range) as DateRangePreset | undefined,
    from: single(searchParams.from),
    to: single(searchParams.to),
    page: single(searchParams.page),
  };
}

/** Resolves a `DateRangePreset` (+ optional custom bounds) into concrete dates, or `undefined`/`undefined` for "all". */
export function resolveDateRange(
  state: Pick<AuditLogFilterState, "range" | "from" | "to">,
  now: Date = new Date(),
): { createdAtFrom?: Date; createdAtTo?: Date } {
  if (!state.range || state.range === "all") {
    return {};
  }
  if (state.range === "custom") {
    const from = state.from ? new Date(state.from) : undefined;
    const to = state.to ? new Date(state.to) : undefined;
    return {
      createdAtFrom: from && !Number.isNaN(from.getTime()) ? from : undefined,
      createdAtTo: to && !Number.isNaN(to.getTime()) ? to : undefined,
    };
  }
  const days = RANGE_PRESETS[state.range];
  return { createdAtFrom: new Date(now.getTime() - days * 24 * 60 * 60 * 1000) };
}

/** Maps parsed URL filter state onto the shape `listAuditEvents` expects. */
export function toAuditEventFilters(state: AuditLogFilterState, now: Date = new Date()): AuditEventFilters {
  const { createdAtFrom, createdAtTo } = resolveDateRange(state, now);
  const transport =
    state.transport && (AUDIT_TRANSPORTS as readonly string[]).includes(state.transport)
      ? state.transport
      : undefined;
  const page = state.page ? Number.parseInt(state.page, 10) : undefined;
  return {
    search: state.q,
    resourceType: state.resource,
    actorUserId: state.actorUserId,
    actorApiKeyId: state.actorApiKeyId,
    transport,
    createdAtFrom,
    createdAtTo,
    page: page && Number.isFinite(page) && page > 0 ? page : undefined,
  };
}

export function hasActiveFilters(state: AuditLogFilterState): boolean {
  return Boolean(
    state.q || state.resource || state.actorUserId || state.actorApiKeyId || state.transport || (state.range && state.range !== "all"),
  );
}
