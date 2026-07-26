# Audit & Compliance - Contract

**Owner:** Ben Anderson
**Status:** Draft

## Purpose

Owns the immutable `AuditEvent` log. Every mutating command in every other context writes here as a side effect, in the same database transaction as the mutation itself, so an audit write can never silently fail while the mutation it describes succeeds. Query/export access is gated by the calling org's `auditRetentionDays` entitlement. This exists from day one - not deferred to when Enterprise is built - because retrofitting audit coverage after the fact means every historical mutation site has to be found and patched, and anything already shipped without it is unrecoverable. It also directly serves the SOC2/NIST compliance expectations already noted in CLAUDE.md.

## Exposed APIs

| Endpoint / Method | Description | Consumers |
|---|---|---|
| `record(tx, event)` | Append one audit event; `tx` is a transaction handle - only callable from inside an open transaction, never a standalone unaudited write. Requires `transport` (`web`/`api`/`cli`/`system`) and accepts nullable `sourceIp`. Redacts known-sensitive fields (`password_hash`, `passwordHash`, `key_hash`, `keyHash`, raw tokens) from `before`/`after` before storage. | Identity & Access, Governance, Prompt Registry, Workflow Orchestration, Billing & Entitlements, VCS Integration (011-vcs-integration) |
| `listAuditEvents(db, orgId, filters, { requestingUserId, now? })` | Paginated reverse-chronological query filtered by organization, the entitlement-resolved retention window, search/resource/actor/transport/date filters, and bounded page size. Until epic 009 lands, retention resolves to the hardcoded Free default: 7 days. Actor display-name search is resolved through the Identity & Access public contract before querying audit rows. | Distribution (audit log UI) |
| `exportAuditEvents(db, orgId, "csv", { now? })` | Bulk CSV export of the organization's complete currently-retained history, including first-class transport/source IP metadata. Until epic 009 defines and resolves a real export entitlement, this fails closed for every org with `AuditExportEntitlementRequiredError`. | Distribution |
| `pruneAuditEvents(db, orgId, { now? })` | Scheduled-job entry point for one organization. Deletes events older than the 7-day hardcoded retention cutoff and writes exactly one transactional `audit.pruned` system event with `transport: "system"` and `after: { deleted: <count> }`. | Scheduler / platform runtime |

## Events Published

None - this context is a sink, not a source.

## Events Consumed

None directly - other contexts call `record()` inline rather than publishing events this context subscribes to, specifically so the write happens transactionally, not eventually.

## Data Contracts

```ts
interface AuditEvent {
  id: string;
  orgId: string | null; // null only when no organization is resolvable at all (e.g. a failed login against an email matching no account in any org)
  actorUserId: string | null; actorApiKeyId: string | null; // one of these, or neither for system actions
  action: string;        // e.g. "policy.updated", "apikey.created", "user.login"
  resourceType: string; resourceId: string | null; // resourceId null alongside orgId in the same unresolvable case above
  before: unknown | null; after: unknown | null; // jsonb diff, redacted of secrets
  transport: "web" | "api" | "cli" | "system"; // audit trail source taxonomy, distinct from operational-log transport
  sourceIp: string | null; // null for system/no-network-origin events
  createdAt: string;
}
```

## Canonical Action Verbs

`action` values use `<resource>.<verb>`. The verb must come from this table unless this contract is extended in the same change that adds a new mutation type.

| Verb | Meaning | UI Color |
|---|---|---|
| `created` | A resource was created. | Green |
| `updated` | A resource's mutable fields changed. | Blue |
| `deleted` | A resource was permanently deleted by a supported workflow. | Red |
| `revoked` | A credential, invitation, or grant was revoked. | Red |
| `reparented` | A hierarchical resource moved or a team was inserted into a hierarchy. | Violet |
| `shared` | Access to a resource was shared. | Violet |
| `accepted` | An invitation or similar pending workflow was accepted. | Green |
| `login` | A user authenticated successfully. | Green |
| `logout` | A user ended a session. | Neutral |
| `login_failed` | An authentication attempt failed. | Red |
| `synced` | An external or CLI sync completed. | Violet |
| `pruned` | Retention pruning removed expired audit rows. | Neutral |

Known noncanonical verb: `invited`. Invitation creation is `invitation.created`; invitation acceptance is `invitation.accepted`.

## Stability Guarantees

`AuditEvent` rows are never updated by application code. Only `pruneAuditEvents()` may delete rows, and only when they are older than the resolved retention window for that organization. Query/export callers also apply the same retention cutoff before physical deletion happens, so stale rows are never visible just because the scheduled job has not run yet.

## Breaking Change Policy

The `action` naming scheme (`resource.verb`) is a public-ish contract once the audit UI/export ships to customers - renaming existing action strings breaks saved filters/exports and requires a PDR.
