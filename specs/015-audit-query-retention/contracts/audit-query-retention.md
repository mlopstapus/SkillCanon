# Contract: Audit Query & Retention

Exports from `src/bcs/audit-compliance/index.ts`.

```ts
type AuditTransport = "web" | "api" | "cli" | "system";
type AuditExportFormat = "csv";

interface AuditEventFilters {
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

interface ListAuditEventsOptions {
  requestingUserId: string;
  now?: Date;
}

interface AuditEventPage {
  items: AuditEvent[];
  page: number;
  pageSize: number;
  total: number;
  retentionDays: number;
}

function listAuditEvents(
  db: PostgresJsDatabase<Record<string, never>>,
  organizationId: string,
  filters: AuditEventFilters,
  options: ListAuditEventsOptions,
): Promise<AuditEventPage>;

function exportAuditEvents(
  db: PostgresJsDatabase<Record<string, never>>,
  organizationId: string,
  format: AuditExportFormat,
  options?: { now?: Date },
): Promise<{ filename: string; contentType: "text/csv"; body: string }>;

function pruneAuditEvents(
  db: PostgresJsDatabase<Record<string, never>>,
  organizationId: string,
  options?: { now?: Date },
): Promise<{ deleted: number; retentionDays: number }>;
```

Errors:

- `AuditExportEntitlementRequiredError`: thrown by `exportAuditEvents()` when `canExportAuditEvents` is false.
- `UnsupportedAuditExportFormatError`: thrown when a caller asks for anything other than `"csv"`.

Temporary entitlement behavior:

- `auditRetentionDays = 7`
- `canExportAuditEvents = false`
