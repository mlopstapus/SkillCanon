# Research: Prompt Registry Tenant Isolation Tests

## Decision: Add one migration (`0019_prompt_registry_rls.sql`) covering the five remaining tables

**Rationale**: `0012_prompt_registry_projects.sql` already enabled and policed RLS on `projects` and `project_members` (the latter isn't in this feature's six-table scope). `0013`/`0017`/`0018` created `prompts`/`prompt_versions`/`subscriptions`/`project_teams`/`project_skill_assignments` but deferred RLS, exactly like Governance's `0009`/`0010` deferred to `0011`. A single new migration keeps the security-boundary change reviewable as one unit and follows the numbering sequence (next available: `0019`).

**Alternatives considered**: Amending `0013`/`0017`/`0018` would rewrite already-merged history. One migration per table would fragment a single logical change across five files for no benefit.

## Decision: Direct `organization_id` predicate for tables that have the column; `EXISTS`-join predicate for tables that don't

**Rationale**: `prompts`, `subscriptions`, and `project_skill_assignments` all carry their own `organization_id` column, so their policies match the existing direct-column pattern from `0007`/`0011`/`0012`. `prompt_versions` (scoped via `prompt_id` → `prompts.organization_id`) and `project_teams` (scoped via `project_id` → `projects.organization_id`) have no `organization_id` column of their own — their policies use the same `EXISTS` subquery shape already established for `project_members` → `projects` in `0012_prompt_registry_projects.sql`.

**Alternatives considered**: Denormalizing `organization_id` onto `prompt_versions`/`project_teams` would require a schema change outside this feature's scope (RLS/tests only, per spec Assumptions) and would duplicate data that's already reliably derivable through a `NOT NULL` foreign key.

## Decision: `FORCE ROW LEVEL SECURITY` on every new policy, matching Governance (not Identity Access)

**Rationale**: Governance's `0011` is the more recent precedent and is stricter — `FORCE` also applies RLS to the table owner, closing a gap Identity Access's `0007` left open. Consistency with the newer, stricter precedent is preferable to matching the older one.

**Alternatives considered**: Omitting `FORCE` (matching `0007`/`0012`) was rejected as a silent regression in defense-in-depth strength for new policies.

## Decision: Reuse `assertCrossTenantDenied` without changing its public signature

**Rationale**: The existing helper already accepts a generic async `fetchResourceById` callback and treats thrown, falsy, or empty-array results as denial — this shape already covers every planned Prompt Registry case (app-layer service call, raw `sql` select, raw `sql` update/insert). Per its contract doc (`specs/011-tenant-isolation-rls/contracts/tenant-isolation-test-helper.md`), reuse is required by spec FR-018/FR-019 unless a genuine shape gap appears.

**Alternatives considered**: A Prompt-Registry-only helper would violate FR-018/FR-019. No gap was found during implementation — every resource type's read/write denial fits the existing `(id) => Promise<unknown>` callback shape, including polymorphic `subscriber_type`/`subscriber_id` (irrelevant to the denial check itself, which only needs the subscription row's own id) and indirectly-scoped resources (`prompt_versions`, `project_teams` — denial proven via the parent's id where no direct app-layer accessor exists, same as Governance's own resolution).

## Decision: Add two small app-layer read helpers rather than reach into `infrastructure/` from the test file

**Rationale**: Every other resource type already has a public `application/get-*.ts` (or equivalent ID-keyed) accessor a real caller would use — `getProject`, `getPromptById`, `getPromptVersion`, `listProjectTeams` (keyed by project id), `listRequiredSkillsForProject` (keyed by project id). `subscriptions` has no such accessor (`unsubscribeSkill` reads-then-deletes internally, but nothing public just reads). Adding `get-subscription.ts` — a one-line wrapper around `findByOrgAndId`, identical in shape to `get-project.ts`/`get-prompt-by-id.ts` — keeps the tenant-isolation test proving denial through a real application entry point instead of an infrastructure-layer function, consistent with Principle II (D1).

**Alternatives considered**: Testing `subscriptions` app-layer denial only through `unsubscribeSkill` (a write) would leave FR-015's read-denial requirement proven only incidentally, not directly. Calling `findByOrgAndId` from `infrastructure/subscriptions-repo.ts` directly in the test file would work today but sets a precedent of tests bypassing the BC's own application layer, which every other resource type in this file avoids.

## Decision: `project_skill_assignments` needs a dedicated fixture helper; every other resource type already has one

**Rationale**: `project-test-helpers.ts`, `project-team-test-helpers.ts`, `prompt-test-helpers.ts`, and `subscription-test-helpers.ts` already exist with cross-org fixtures baked in. No `project-skill-assignment-test-helpers.ts` exists yet (only `assign-skill-to-project.test.ts`/`unassign-skill-from-project.test.ts`, which build fixtures inline per test). A small dedicated helper (`makeProjectSkillAssignmentFixtureOrg`) keeps this feature's test file consistent with the other five `describe` blocks instead of duplicating inline fixture setup.

**Alternatives considered**: Building the fixture inline inside `tenant-isolation.test.ts` was rejected — every other resource type in this file delegates fixture construction to its BC helper file, and a project-skill-assignment fixture is non-trivial (needs an org, a project, an owner team, and a team-owned skill assigned to that project).

## Decision: Document query audit in the Prompt Registry application folder

**Rationale**: The spec (FR-009/FR-010, User Story 2) requires every tenant-scoped query in features 001/002/003/007 to be audited for `organization_id` filtering. A compact `src/bcs/prompt-registry/application/query-audit.md`, matching Governance's `query-audit.md` format exactly, is easier to keep current than burying the result in a PR body.

**Alternatives considered**: Relying only on code review leaves SC-004 without a durable artifact, and Governance's own precedent already established the expected format.
