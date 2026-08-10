---
epic: 001-typescript-refactor-foundation
feature: 002-drizzle-shared-db-kernel
status: done
dependencies: ["backlog/000-foundations/002-database-schema-and-tenancy-conventions.md"]
---

# Drizzle Shared DB Kernel

Build the shared database plumbing every bounded context will use: the Drizzle client, connection pool, per-BC Postgres schema wiring, the RLS session-variable mechanism, and the `withAudit()` transactional wrapper that guarantees an audit write can never be separated from the mutation it describes (PDR-005). This is infrastructure owned by Distribution per its OWNERSHIP.md (`/shared/db/`), built once here so no BC epic has to invent its own DB access pattern.

## Requirements

- [ ] Drizzle configured against Postgres with `drizzle-kit` migration tooling wired to `pnpm db:migrate` / `pnpm db:generate` scripts
- [ ] Seven Postgres schemas created via migration (`identity_access`, `governance`, `prompt_registry`, `workflow`, `billing`, `audit`, `distribution`) per each BC's OWNERSHIP.md
- [ ] RLS session-variable mechanism implemented per `context/database-conventions.md` (e.g. a request-scoped `withTenantContext(organizationId, fn)` helper that sets the session variable inside a transaction)
- [ ] `withAudit(mutationFn, auditEvent)` wrapper implemented — runs the mutation and the `audit.audit_events` insert in the same transaction, so one cannot commit without the other
- [ ] Standard column helpers (`id`, `organization_id`, `created_at`, `updated_at`) as reusable Drizzle column builders, so every BC's schema file uses the same primitives

## Acceptance Criteria

- [ ] A throwaway test table in a test schema demonstrates: inserting via `withTenantContext` sets the org correctly, and a query without the tenant context set is denied by RLS (not just filtered — actually denied)
- [ ] A throwaway test mutation demonstrates `withAudit()`: forcing the audit insert to fail (e.g. a constraint violation) also rolls back the paired mutation
- [ ] `pnpm db:migrate` runs cleanly against a fresh Postgres instance and creates all seven schemas

## Open Questions

- Does the RLS session variable get set per-request at the Next.js route-handler layer, or per-transaction inside `withTenantContext`? Affects how MCP tool handlers (which don't go through the same route-handler middleware as REST) pick it up consistently.

## Dependencies

- `backlog/000-foundations/002-database-schema-and-tenancy-conventions.md`

## Technical Notes

Per tenet M2, RLS is a backstop, not the primary control — this feature builds the mechanism, but each BC epic's own tenant-isolation-tests feature is what actually proves M1 (app-layer scoping) and M2 (RLS) both hold for its own tables. Per tenet C1, `withAudit()` existing and being the *only* sanctioned way to perform a mutation (not an optional wrapper) is what makes the audit-coverage guarantee real rather than aspirational — later epics should be reviewed against "did this mutation go through withAudit()," not just "does an audit event usually get written."
