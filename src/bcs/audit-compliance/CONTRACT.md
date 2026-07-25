# Audit & Compliance — Contract

**Owner:** Ben Anderson
**Status:** Draft

## Purpose

Owns the immutable `AuditEvent` log. Every mutating command in every other context writes here as a side effect, in the same database transaction as the mutation itself, so an audit write can never silently fail while the mutation it describes succeeds. Query/export access is gated by the calling org's `auditRetentionDays` entitlement. This exists from day one — not deferred to when Enterprise is built — because retrofitting audit coverage after the fact means every historical mutation site has to be found and patched, and anything already shipped without it is unrecoverable. It also directly serves the SOC2/NIST compliance expectations already noted in CLAUDE.md.

## Exposed APIs

| Endpoint / Method | Description | Consumers |
|---|---|---|
| `record(tx, event)` | Append one audit event; `tx` is a transaction handle — only callable from inside an open transaction, never a standalone unaudited write. Redacts known-sensitive fields (`password_hash`, `key_hash`, raw tokens) from `before`/`after` before storage. First real caller: Identity & Access's `login`/`logout` (008-jwt-session-auth) | Identity & Access, Governance, Prompt Registry, Workflow Orchestration, Billing & Entitlements, VCS Integration (011-vcs-integration) |
| `list(orgId, filters, { requestingUserId })` | Paginated query, filtered by the entitlement-resolved retention window | Distribution (audit log UI) |
| `export(orgId, format)` | Bulk export (Enterprise-gated via entitlement) | Distribution |

## Events Published

None — this context is a sink, not a source.

## Events Consumed

None directly — other contexts call `record()` inline rather than publishing events this context subscribes to, specifically so the write happens transactionally, not eventually.

## Data Contracts

```ts
interface AuditEvent {
  id: string;
  orgId: string | null; // null only when no organization is resolvable at all (e.g. a failed login against an email matching no account in any org)
  actorUserId: string | null; actorApiKeyId: string | null; // one of these, or neither for system actions
  action: string;        // e.g. "policy.updated", "apikey.created", "user.login"
  resourceType: string; resourceId: string | null; // resourceId null alongside orgId in the same unresolvable case above
  before: unknown | null; after: unknown | null; // jsonb diff, redacted of secrets
  createdAt: string;
}
```

## Stability Guarantees

`AuditEvent` rows are never updated or deleted by application code (append-only); only entitlement-driven retention pruning removes rows past an org's window, and pruning is a scheduled job owned by this BC, not ad hoc deletes from elsewhere.

## Breaking Change Policy

The `action` naming scheme (`resource.verb`) is a public-ish contract once the audit UI/export ships to customers — renaming existing action strings breaks saved filters/exports and requires a PDR.
