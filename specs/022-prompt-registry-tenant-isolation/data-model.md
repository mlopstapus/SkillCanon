# Data Model: Prompt Registry Tenant Isolation Tests

## Project

- Existing table: `prompt_registry.projects`
- Tenant key: `organization_id` (direct column)
- Relevant identity: `id`
- RLS rule (already present, `0012`): app-role sessions may read or mutate rows only when the row `organization_id` equals the current tenant context organization id.

## Project-team link (collaborator team)

- Existing table: `prompt_registry.project_teams`
- Tenant key: none direct — resolved via `project_id` → `projects.organization_id`
- Relevant identity: `id` (row); app-layer accessors are keyed by `project_id` instead (no public accessor reads a `project_teams` row by its own id — `listProjectTeams`/`addCollaboratorTeam`/`removeCollaboratorTeam` are all keyed by `projectId` + `teamId`)
- RLS rule (new, `0019`): `EXISTS` join to `projects` — same shape as `project_members` → `projects` in `0012`.

## Skill (Prompt)

- Existing table: `prompt_registry.prompts`
- Tenant key: `organization_id` (direct column)
- Relevant identity: `id`
- RLS rule (new, `0019`): app-role sessions may read or mutate rows only when the row `organization_id` equals the current tenant context organization id.

## Prompt version

- Existing table: `prompt_registry.prompt_versions`
- Tenant key: none direct — resolved via `prompt_id` → `prompts.organization_id`
- Relevant identity: `id`
- RLS rule (new, `0019`): `EXISTS` join to `prompts`.
- Note: immutable by domain design (constitution/comment in `schema.ts`) — no application service updates an existing version row, so this feature's write-denial proof for versions is RLS-alone only (a raw `UPDATE` attempt), not an app-layer write path.

## Subscription

- Existing table: `prompt_registry.subscriptions`
- Tenant key: `organization_id` (direct column)
- Relevant identity: `id`
- RLS rule (new, `0019`): app-role sessions may read or mutate rows only when the row `organization_id` equals the current tenant context organization id.
- Note: polymorphic `subscriber_type`/`subscriber_id` (user or team) is irrelevant to the denial check itself, which targets the subscription row's own `id`.

## Project-skill assignment

- Existing table: `prompt_registry.project_skill_assignments`
- Tenant key: `organization_id` (direct column, denormalized rather than derived via `project_id` join)
- Relevant identity: `id` (row); app-layer accessors (`listRequiredSkillsForProject`, `unassignSkillFromProject`) are keyed by `project_id` (+ `skill_id` for the write), same shape as `project_teams`
- RLS rule (new, `0019`): app-role sessions may read or mutate rows only when the row `organization_id` equals the current tenant context organization id.

## Organization-Scoped Database Session

- Existing mechanism: `withTenantContext()` (`src/shared/db/tenant-context.ts`) sets the session-scoped organization id (`app.current_org_id`, via `set_config(..., true)`, transaction-local) used by every RLS predicate above.
- Validation behavior: direct unfiltered queries for another organization return no row, and direct unfiltered writes for another organization affect zero rows.

## Cross-Tenant Denial Helper

- Existing module: `src/shared/testing/tenant-isolation.ts`
- Existing contract: `assertCrossTenantDenied()` accepts the acting org, owning org, resource id, and a callback that fetches or writes by id; denial means the callback throws, or resolves falsy/an empty array.
- Prompt Registry use: one `describe` block per resource type above (six total), each with app-layer read/write denial and RLS-alone raw-SQL read/write denial — except `prompt_versions`, which has no app-layer write path to test (see note above), so its block covers app-layer read + RLS-alone read/write only.
