# Data Model: Governance Tenant Isolation Tests

## Policy

- Existing table: `governance.policies`
- Tenant key: `organization_id`
- Relevant identity: `id`
- Scope columns: exactly one of `team_id` or `project_id`
- RLS rule: app-role sessions may read or mutate rows only when the row `organization_id` equals the current tenant context organization id.

## Objective

- Existing table: `governance.objectives`
- Tenant key: `organization_id`
- Relevant identity: `id`
- Scope columns: optional `team_id`, `project_id`, `user_id`, and `parent_objective_id`
- RLS rule: app-role sessions may read or mutate rows only when the row `organization_id` equals the current tenant context organization id.

## Organization-Scoped Database Session

- Existing mechanism: `withTenantContext()` sets the session-scoped organization id used by RLS predicates.
- Validation behavior: direct unfiltered queries for another organization return no row, and direct unfiltered writes for another organization affect zero rows.

## Cross-Tenant Denial Helper

- Existing module: `src/shared/testing/tenant-isolation.ts`
- Existing contract: `assertCrossTenantDenied()` accepts the acting org, owning org, resource id, and a callback that fetches or writes by id.
- Governance use: one app-layer read/write denial check and one RLS-alone read/write denial check per resource type.
