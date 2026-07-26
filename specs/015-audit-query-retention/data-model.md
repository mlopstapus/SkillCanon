# Data Model: Audit Query & Retention

## AuditEvent

Existing entity stored in `audit.audit_events` and represented by `src/bcs/audit-compliance/domain/audit-event.ts`.

Fields used by this feature:

| Field | Notes |
| --- | --- |
| `id` | DB-generated UUID |
| `organizationId` | Tenant key. Query/export/prune only operate on non-null organization ids supplied by the caller. |
| `actorUserId` | Exact actor filter candidate; null for API-key/system/unknown actors. |
| `actorApiKeyId` | Exact actor filter candidate; null for user/system/unknown actors. |
| `action` | Free-text searchable. |
| `resourceType` | Exact resource-type filter and free-text searchable. |
| `resourceId` | Free-text searchable when present. |
| `before` / `after` | Already redacted by `record()` before storage; returned/exported as stored. |
| `createdAt` | Sort key, date-range filter, retention cutoff filter, prune cutoff filter. |

No schema migration is planned for this feature.

## RetentionEntitlements

Resolved per call, currently hardcoded until epic 009.

```ts
interface AuditEntitlements {
  auditRetentionDays: number; // 7
  canExportAuditEvents: boolean; // false
}
```

Validation rules:

- `auditRetentionDays` must be positive.
- The cutoff is `now - auditRetentionDays`.
- `list()` and export must apply the cutoff even before physical pruning runs.
- Prune deletes `createdAt < cutoff` and leaves `createdAt >= cutoff`.

## AuditEventFilters

```ts
interface AuditEventFilters {
  search?: string;
  resourceType?: string;
  actorUserId?: string;
  actorApiKeyId?: string;
  transport?: "web" | "api" | "cli" | "system";
  createdAtFrom?: Date;
  createdAtTo?: Date;
  page?: number;
  pageSize?: number;
}
```

Rules:

- All supplied filters are ANDed together.
- `search` is case-insensitive partial matching across owned event fields plus human actor display names resolved to same-org user IDs through Identity & Access.
- Actor filter accepts either user id or API-key id; supplying both means either actor column may match.
- `transport` maps to the existing audit row shape by reading `after.transport` first and `before.transport` second when present. System prune events write `after.transport = "system"` and `after.deleted = <count>`.
- Page numbers beyond the last page return an empty `items` array.
- Page size is bounded by a domain maximum.

## Pruning Run

No separate table. A completed run is represented by exactly one `AuditEvent`:

```ts
{
  organizationId,
  actorUserId: null,
  actorApiKeyId: null,
  action: "audit.pruned",
  resourceType: "audit_event",
  resourceId: null,
  before: null,
  after: { transport: "system", deleted: number }
}
```
