# Contract: Governance Tenant Isolation

## Scope

This contract covers database-level and application-level tenant isolation for:

- `governance.policies`
- `governance.objectives`

## RLS Behavior

For app-role sessions with tenant context set to organization A:

- Selecting a policy or objective owned by organization B by exact id returns no row.
- Updating a policy or objective owned by organization B by exact id affects zero rows.
- Deleting or deactivating a policy/objective owned by organization B by exact id affects zero rows.

For privileged migration/seed connections, setup may bypass ordinary app-role RLS using the established test DB privileged connection.

## Test Helper Behavior

Governance tests MUST call `assertCrossTenantDenied()` from `src/shared/testing/tenant-isolation.ts`.

The callback supplied to `assertCrossTenantDenied()` may represent:

- An app-layer read or write operation that includes `organization_id` filtering.
- A raw Drizzle read or write by id with no app-layer `organization_id` filter, executed inside `withTenantContext()`.

The helper succeeds only when cross-tenant access throws, returns a falsy value, or returns an empty array.

## Query Audit Behavior

The implementation MUST record the audit result for existing policy and objective service queries. The audit is complete when every tenant-scoped read/write/list query includes the caller's `organization_id`, or any missing filter has been fixed.
