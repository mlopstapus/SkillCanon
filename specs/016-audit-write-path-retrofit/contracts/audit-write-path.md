# Contract: Audit Write Path

## `record(tx, event)`

Appends exactly one audit event using the caller's open transaction handle.

Input:

```ts
interface NewAuditEvent {
  organizationId: string | null;
  actorUserId: string | null;
  actorApiKeyId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before?: unknown | null;
  after?: unknown | null;
  transport: "web" | "api" | "cli" | "system";
  sourceIp?: string | null;
}
```

Behavior:

- Redacts known-sensitive keys from `before` and `after`.
- Inserts one row into `audit.audit_events`.
- Rejects missing or invalid `transport`.
- Does not open its own transaction.
- Does not expose update or delete operations.

## `withAudit(db, mutationFn, auditWriteFn)`

Runs `mutationFn(tx)` and then `auditWriteFn(tx)` in a single database transaction.

Guarantees:

- If the mutation throws, no audit row is written.
- If the audit write throws, the mutation rolls back.
- The mutation result is returned after both operations complete.
