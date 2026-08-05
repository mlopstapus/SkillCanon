# Data Model: Distribution Tenant Isolation Tests

## Prompt usage record

- Existing table: `distribution.prompt_usage`
- Tenant key: `organization_id` (direct column)
- Relevant identity: `id`
- Columns (as of `0025_distribution_usage_telemetry.sql`): `id`, `organization_id`, `prompt_id`, `prompt_version_id`, `prompt_version`, nullable `project_id`, nullable `user_id`, `status_code`, nullable `latency_ms`, nullable `git_remote_url`, nullable `git_branch`, nullable `git_commit_sha`, `created_at`
- RLS rule (new, `0026`): app-role sessions may read or mutate rows only when the row `organization_id` equals the current tenant context organization id — direct-column predicate, no join needed.
- Note: immutable, append-only by domain design (`schema.ts`'s own doc comment: "One row per genuine runtime usage event... no `updated_at`"). No application-layer function reads a single row by id, and none updates or deletes a row at all — the only exposed reads are organization/project-scoped *aggregates* (`getPromptUsageSummaryForProject`, `getPromptUsageSummaryForOrganization`). This feature's read/write denial proof for this resource is therefore RLS-alone (raw SQL select/update/delete-by-id, plus a real `recordPromptUsage()` call attempting a cross-org insert), not an app-layer by-id accessor — see `research.md`'s equivalent decision, matching the shape already established for Prompt Registry's own immutable `prompt_versions` table.

## Organization-Scoped Database Session

- Existing mechanism: `withTenantContext()` (`src/shared/db/tenant-context.ts`) sets the session-scoped organization id (`app.current_org_id`, via `set_config(..., true)`, transaction-local) used by the RLS predicate above.
- Validation behavior: direct unfiltered queries for another organization return no row, and direct unfiltered writes (including a real `recordPromptUsage()` call whose `organizationId` argument disagrees with the session's tenant context) are denied.

## Cross-Tenant Denial Helper

- Existing module: `src/shared/testing/tenant-isolation.ts`
- Existing contract: `assertCrossTenantDenied()` accepts the acting org, owning org, resource id, and a callback that fetches or writes by id; denial means the callback throws, or resolves falsy/an empty array.
- Distribution use: one `describe` block for the usage resource, covering RLS-alone raw-SQL read denial (select by id), RLS-alone raw-SQL write denial (update-by-id, delete-by-id), and RLS `WITH CHECK` denial of a real `recordPromptUsage()` insert attempt claiming a different organization than the session's tenant context.
