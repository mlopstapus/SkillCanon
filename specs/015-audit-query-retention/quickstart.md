# Quickstart: Audit Query & Retention

Run the focused checks after implementation:

```bash
pnpm vitest run src/bcs/audit-compliance/application/list.test.ts
pnpm vitest run src/bcs/audit-compliance/application/prune.test.ts
pnpm vitest run src/bcs/audit-compliance/application/export.test.ts
pnpm vitest run src/bcs/audit-compliance/infrastructure/audit-events-repo.test.ts
pnpm typecheck
pnpm lint
```

Expected outcomes:

- `listAuditEvents()` returns only the requested organization's events, inside the 7-day retention window, newest first.
- Each filter dimension narrows results alone and in combination.
- `pruneAuditEvents()` deletes only rows older than the cutoff and writes one `audit.pruned` row with `{ transport: "system", deleted }`.
- `exportAuditEvents()` rejects by default because no live export entitlement exists yet.
