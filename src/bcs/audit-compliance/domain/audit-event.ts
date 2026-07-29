/**
 * General read/write shape, reused by every future BC that calls `record()`
 * — not specific to any one feature. `actorApiKeyId`/`before`/`after` are
 * typed loosely because a future non-auth mutation will populate them; this
 * feature's own call sites (identity-access's login/logout) always pass
 * `null` for the fields an auth event has no value for.
 */
export const AUDIT_TRANSPORTS = ["web", "api", "cli", "system"] as const;

export type AuditTransport = (typeof AUDIT_TRANSPORTS)[number];

export interface AuditContext {
  transport: AuditTransport;
  sourceIp?: string | null;
}

export const DEFAULT_WEB_AUDIT_CONTEXT: AuditContext = { transport: "web", sourceIp: null };

export const AUDIT_ACTION_VERBS = [
  "created",
  "updated",
  "deleted",
  "revoked",
  "reparented",
  "shared",
  "accepted",
  "login",
  "logout",
  "login_failed",
  "synced",
  "pruned",
  "published",
] as const;

export type AuditActionVerb = (typeof AUDIT_ACTION_VERBS)[number];

export const AUDIT_ACTION_VERB_COLORS: Record<AuditActionVerb, string> = {
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

export function getAuditActionVerb(action: string): string {
  return action.includes(".") ? action.slice(action.lastIndexOf(".") + 1) : action;
}

export interface AuditEvent {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  actorApiKeyId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: unknown | null;
  after: unknown | null;
  transport: AuditTransport;
  sourceIp: string | null;
  createdAt: Date;
}

/** Input to `record()` — everything but the DB-generated `id`/`createdAt`. */
export interface NewAuditEvent {
  organizationId: string | null;
  actorUserId: string | null;
  actorApiKeyId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before?: unknown | null;
  after?: unknown | null;
  transport: AuditTransport;
  sourceIp?: string | null;
}

/**
 * Keys stripped (deeply, anywhere in the object) from `before`/`after`
 * before storage — never store secret material even inside an audit diff
 * (tenet S3 extended to the audit trail).
 */
export const REDACTED_KEYS = [
  "password_hash",
  "passwordHash",
  "key_hash",
  "keyHash",
  "token",
  "raw_token",
  "rawToken",
  "jwt",
] as const;

export const DEFAULT_AUDIT_RETENTION_DAYS = 7;
export const DEFAULT_AUDIT_PAGE_SIZE = 50;
export const MAX_AUDIT_PAGE_SIZE = 200;

export type AuditExportFormat = "csv";

export interface AuditEntitlements {
  auditRetentionDays: number;
  canExportAuditEvents: boolean;
}

export interface AuditEventFilters {
  search?: string;
  resourceType?: string;
  actorUserId?: string;
  actorApiKeyId?: string;
  transport?: AuditTransport;
  createdAtFrom?: Date;
  createdAtTo?: Date;
  page?: number;
  pageSize?: number;
}

export interface NormalizedAuditEventFilters extends Omit<AuditEventFilters, "page" | "pageSize"> {
  retentionCutoff: Date;
  actorUserIds?: string[];
  limit?: number;
  offset?: number;
}

export interface ListAuditEventsOptions {
  requestingUserId: string;
  now?: Date;
}

export interface AuditEventPage {
  items: AuditEvent[];
  page: number;
  pageSize: number;
  total: number;
  retentionDays: number;
}

export interface AuditExportResult {
  filename: string;
  contentType: "text/csv";
  body: string;
}

export class AuditExportEntitlementRequiredError extends Error {
  code = "ENTITLEMENT_REQUIRED";

  constructor() {
    super('This feature requires the "auditExport" entitlement, which is not enabled.');
    this.name = "AuditExportEntitlementRequiredError";
  }
}

export class UnsupportedAuditExportFormatError extends Error {
  constructor(format: string) {
    super(`Unsupported audit export format: ${format}`);
    this.name = "UnsupportedAuditExportFormatError";
  }
}

export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

export function normalizeAuditPagination(filters: AuditEventFilters): {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const requestedPageSize = Math.trunc(filters.pageSize ?? DEFAULT_AUDIT_PAGE_SIZE);
  const pageSize = Math.min(MAX_AUDIT_PAGE_SIZE, Math.max(1, requestedPageSize));
  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}
