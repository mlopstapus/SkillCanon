---
type: foundations
item: 002-database-schema-and-tenancy-conventions
status: done
deliverable: context/database-conventions.md
---

# Database Schema & Tenancy Conventions

Tenet M1 requires every tenant-scoped table to carry (or resolve to) a `tenant_id` and every query to filter by it; tenet M2 requires Postgres RLS as a backstop on every tenant-scoped table. Both need a concrete, repeatable pattern established once, before the first migration is written, not decided ad hoc per bounded context as each one gets built.

## What We Need to Decide / Research

- Standard columns every table gets: `id` (uuid), `organization_id` (except genuinely global tables like `billing.plans`), `created_at`, `updated_at` — confirm naming and types match across all BCs.
- The RLS pattern: session-variable-based (`SET app.current_org_id`) vs. a Postgres role-per-tenant model vs. policy predicates keyed off a function reading the JWT claims. Needs to work with Drizzle's connection pooling model.
- Soft-delete vs. hard-delete convention — does anything in this domain need soft-delete (e.g. for audit/compliance reasons), or is hard-delete fine given the Audit & Compliance context already captures the before-state?
- Migration workflow with `drizzle-kit`: naming convention, review process, how a migration is tied to the BC that owns the schema it touches.
- How cross-schema foreign keys are handled (e.g. `identity_access.organizations.id` referenced from `billing.subscriptions.organization_id`) — allowed, or should cross-schema references go through application-level ID checks only, to keep schemas genuinely decoupled?

## Options / Considerations

- RLS via session variable set per-request (`SET LOCAL app.current_org_id = $1` at the start of each request's transaction) is the most common Drizzle/Postgres pattern and keeps the policy predicate simple (`organization_id = current_setting('app.current_org_id')::uuid`) — worth defaulting to this unless research surfaces a reason not to.
- Hard-delete is likely fine everywhere except `audit.audit_events` (never deleted by app code at all, only by the entitlement-driven retention job) — soft-delete adds query complexity (every query needs `WHERE deleted_at IS NULL`) without a clear requirement driving it yet.

## Deliverable

`context/database-conventions.md` — standard columns, the chosen RLS mechanism with a concrete example policy, migration workflow, and the cross-schema FK decision. This is the reference every BC epic's model/CRUD features point back to.

## Dependencies

None. Should land before or alongside `001-repo-structure-and-module-boundaries`.
