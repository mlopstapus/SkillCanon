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
