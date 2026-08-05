# Contract: Distribution Tenant Isolation

## Scope

This contract covers database-level and application-level tenant isolation for:

- `distribution.prompt_usage`

## RLS Behavior

For app-role sessions with tenant context set to organization A:

- Selecting a prompt usage row owned by organization B by exact id returns no row.
- Updating or deleting a prompt usage row owned by organization B by exact id affects zero rows.
- Inserting a prompt usage row that claims organization B as its `organization_id`, while the session's tenant context is organization A, is denied by the `WITH CHECK` clause — including through the real `recordPromptUsage()` application function, whose `organizationId` parameter is caller-supplied rather than session-derived.
- `distribution.prompt_usage` has a direct `organization_id` column — no join is needed to resolve its tenant scope.

For privileged migration/seed connections, setup may bypass ordinary app-role RLS using the established test DB privileged connection (`testDb.ownerDb`).

## Test Helper Behavior

Distribution tests MUST call `assertCrossTenantDenied()` from `src/shared/testing/tenant-isolation.ts`.

The callback supplied to `assertCrossTenantDenied()` may represent:

- A raw Drizzle read or write by id with no app-layer `organization_id` filter, executed inside `withTenantContext()`.
- A real application-layer call (`recordPromptUsage()`) whose supplied `organizationId` disagrees with the session's tenant context.

The helper succeeds only when cross-tenant access throws, returns a falsy value, or returns an empty array.

`distribution.prompt_usage` has no application-layer read-by-id, update, or delete path at all (immutable, append-only, aggregate-only reads) — its coverage is RLS-alone read/write denial (raw SQL select/update/delete-by-id) plus the `recordPromptUsage()` cross-org insert-denial case above, not an app-layer by-id read/write proof. The existing app-layer organization-scoping proof for this resource is the aggregate functions' own cross-org-exclusion tests (`get-prompt-usage-summary-for-project.test.ts`, `get-prompt-usage-summary-for-organization.test.ts`), referenced — not duplicated — by this feature's query audit.

## Query Audit Behavior

The implementation MUST record the audit result for every tenant-scoped service query in the Distribution bounded context that reads or writes `distribution.prompt_usage`: `recordPromptUsage`, `getPromptUsageSummaryForProject` (and its internal repo reads), and `getPromptUsageSummaryForOrganization` (and its internal repo reads). The audit is complete when every tenant-scoped read/write includes the caller's `organization_id`, or any missing filter has been fixed.
