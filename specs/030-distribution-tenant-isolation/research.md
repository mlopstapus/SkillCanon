# Research: Distribution Tenant Isolation Tests

## Decision: Add one migration (`0026_distribution_rls.sql`) covering `distribution.prompt_usage`

**Rationale**: `0022_distribution_prompt_usage.sql` created the table and `0025_distribution_usage_telemetry.sql` extended its columns, both deliberately deferring RLS (matching Identity Access's/Governance's/Prompt Registry's own established precedent of shipping a table without RLS and closing the gap in a dedicated tenant-isolation feature). This is the only table in the `distribution` schema as of this feature's implementation, so the migration is single-table and single-purpose. Next available migration number is `0026`.

**Alternatives considered**: Amending `0022`/`0025` would rewrite already-merged, already-deployed migration history. Splitting into a schema-setup migration plus a policy migration would add an unneeded second file for one table.

## Decision: Direct `organization_id` predicate (no join)

**Rationale**: `distribution.prompt_usage` carries its own `organization_id` column directly (unlike Prompt Registry's `prompt_versions`/`project_teams`, which needed an `EXISTS`-join predicate because they have no `organization_id` column of their own). This matches the simpler direct-column pattern already used for `prompt_registry.prompts`/`.subscriptions`/`.project_skill_assignments` in `0019_prompt_registry_rls.sql`.

**Alternatives considered**: None — no indirection exists for this table, so a join predicate would be unjustified complexity.

## Decision: `FORCE ROW LEVEL SECURITY`, matching Governance and Prompt Registry (not Identity Access)

**Rationale**: `FORCE` also applies RLS to the table owner, closing a gap Identity Access's `0007` left open. Every RLS migration since Governance's `0011` uses `FORCE`; this feature continues that stricter, more recent precedent.

**Alternatives considered**: Omitting `FORCE` (matching `0007`) was rejected as a silent regression in defense-in-depth strength for a new policy.

## Decision: Reuse `assertCrossTenantDenied` without changing its public signature

**Rationale**: The existing helper accepts a generic async `fetchResourceById` callback and treats thrown, falsy, or empty-array results as denial. This shape already covers every case this feature needs: a raw `sql` select-by-id, a raw `sql` update/delete-by-id, and an app-layer insert attempt that should be rejected by the `WITH CHECK` clause. Per its contract doc (`specs/011-tenant-isolation-rls/contracts/tenant-isolation-test-helper.md`) and spec FR-009/FR-010, reuse is required unless a genuine shape gap appears — none was found.

**Alternatives considered**: A Distribution-only helper would violate FR-009/FR-010. No gap was found: `prompt_usage`'s read/write denial fits the existing `(id) => Promise<unknown>` callback shape exactly as Prompt Registry's immutable `prompt_versions` case already did (see `022-prompt-registry-tenant-isolation/research.md`'s equivalent decision).

## Decision: `prompt_usage` has no application-layer "get by id" or update/delete path at all — read and write denial for this resource are proven at the RLS layer (raw SQL), not through a new app-layer accessor

**Rationale**: Every prior tenant-isolation feature (Identity Access, Governance, Prompt Registry) proved app-layer read/write denial through a real, already-existing (or minimally-added, e.g. Prompt Registry's `get-subscription.ts`) application function keyed by a resource's own id. `distribution.prompt_usage` is architecturally different: it is an append-only event log with no per-row identity a caller ever looks up (`CONTRACT.md`'s only exposed reads are organization/project-scoped *aggregates* — `getPromptUsageSummaryForProject`, `getPromptUsageSummaryForOrganization` — never a single row by id), and no update/delete function exists anywhere in the BC (rows are immutable by design, matching Prompt Registry's `prompt_versions`). Inventing a `getPromptUsageById`/update/delete accessor purely to give this test file an app-layer entry point would add production surface area no real caller needs, which the spec's Assumptions explicitly rule out ("no end-user-facing UI changes... reuses existing queries").

Re-reading the spec's own User Story 1 acceptance scenarios confirms this reading is intentional, not a gap: both scenarios are phrased as the session querying/writing "**without** an application-layer organization filter" — i.e., they already describe the RLS-alone (raw SQL) proof, not an app-layer proof. FR-006/FR-007's "by exact ID" language is satisfied by the raw-SQL select/update/delete-by-id checks, which target a specific row's id exactly as literally as an app-layer accessor would. User Story 2's app-layer audit requirement is separately satisfied by the resource's real read surface — the two summary functions — which already filter by `organization_id` and already have passing cross-org-exclusion tests (`get-prompt-usage-summary-for-project.test.ts`'s "never returns another organization's usage rows, even given the same projectId"; `get-prompt-usage-summary-for-organization.test.ts`'s "aggregates ... within the requested organization"). This feature's own test file adds the RLS-alone backstop those tests don't cover, without duplicating them.

**Alternatives considered**: Adding a `getPromptUsageById` read accessor and a raw-repo update/delete function was rejected — it would be dead production code with no real caller, existing only to make this test file's shape match other resource types', which is form over substance. The alternative of skipping an app-layer proof entirely was also rejected: the existing summary-function tests already are the app-layer proof (FR-004/User Story 2), they just needed to be identified and referenced rather than re-invented.

## Decision: Prove the INSERT `WITH CHECK` denial through the real `recordPromptUsage` function, not raw SQL

**Rationale**: `recordPromptUsage` takes `organizationId` as a caller-supplied parameter, not something it derives from the session — this is the one place a wrong-org write could plausibly happen through the real application path (e.g., a future bug passing the wrong org). Calling `withTenantContext(db, orgA, tx => recordPromptUsage(tx, { organizationId: orgB, ... }))` and asserting it throws (RLS `WITH CHECK` violation) is both a more realistic scenario than a hand-written raw `INSERT` and requires no new code — `recordPromptUsage` already accepts these exact parameters.

**Alternatives considered**: A raw `sql` `INSERT` statement would prove RLS works but wouldn't prove the real call path is actually covered — the app function's assembled `.values()` call is the thing that must be denied end-to-end.

## Decision: Document query audit in the Distribution application folder

**Rationale**: The spec (FR-004/FR-005, User Story 2) requires every tenant-scoped query in this BC to be audited for `organization_id` filtering. A compact `src/bcs/distribution/application/query-audit.md`, matching Governance's and Prompt Registry's `query-audit.md` format, is easier to keep current than burying the result in a PR body, and gives SC-004 a durable, checkable artifact.

**Alternatives considered**: Relying only on code review leaves SC-004 without a durable artifact, and two prior features already established the expected format.
