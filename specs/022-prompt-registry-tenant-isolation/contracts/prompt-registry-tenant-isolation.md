# Contract: Prompt Registry Tenant Isolation

## Scope

This contract covers database-level and application-level tenant isolation for:

- `prompt_registry.projects`
- `prompt_registry.project_teams`
- `prompt_registry.prompts`
- `prompt_registry.prompt_versions`
- `prompt_registry.subscriptions`
- `prompt_registry.project_skill_assignments`

## RLS Behavior

For app-role sessions with tenant context set to organization A:

- Selecting a project, collaborator-team link, skill, version, subscription, or project-skill assignment owned by organization B by exact id returns no row.
- Updating or inserting against a row scoped to organization B by exact id affects zero rows.
- `project_teams` and `prompt_versions` have no direct `organization_id` column — their tenant scope resolves through `project_id` → `projects.organization_id` and `prompt_id` → `prompts.organization_id` respectively; RLS still independently denies access based on the resource's owning organization.

For privileged migration/seed connections, setup may bypass ordinary app-role RLS using the established test DB privileged connection (`testDb.ownerDb`).

## Test Helper Behavior

Prompt Registry tests MUST call `assertCrossTenantDenied()` from `src/shared/testing/tenant-isolation.ts`.

The callback supplied to `assertCrossTenantDenied()` may represent:

- An app-layer read or write operation that includes `organization_id` filtering (directly, or indirectly via a parent project/prompt lookup).
- A raw Drizzle read or write by id with no app-layer `organization_id` filter, executed inside `withTenantContext()`.

The helper succeeds only when cross-tenant access throws, returns a falsy value, or returns an empty array.

`prompt_versions` has no application-layer write path (immutable by design) — its coverage is app-layer read + RLS-alone read/write, not app-layer write.

## Query Audit Behavior

The implementation MUST record the audit result for every tenant-scoped service query introduced by features 001 (project model & membership), 002 (prompt & version model), 003 (skill sharing — subscribe & fork), and 007 (project skill assignment). The audit is complete when every tenant-scoped read/write/list query includes the caller's `organization_id` (directly or via a parent lookup), or any missing filter has been fixed.
