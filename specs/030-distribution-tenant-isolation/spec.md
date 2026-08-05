# Feature Specification: Distribution Tenant Isolation Tests

**Feature Branch**: `030-distribution-tenant-isolation`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "'/Users/ben/repos/SpecHub/backlog/008-distribution/006-distribution-tenant-isolation-tests.md' — Apply Postgres RLS to distribution.prompt_usage (and any other distribution-schema table added by the time this epic starts), per tenets M1/M2/M3. Flagged during 024-project-usage-metrics-dashboard's implementation: that feature created distribution.prompt_usage — the first table in this schema — without RLS, matching prompt_registry's own established precedent of shipping without RLS and deferring it to a dedicated feature. Application-layer organizationId/projectId scoping is 024's sole current control, verified by tests but with no independent RLS backstop. Requirements: RLS policies enabled on distribution.prompt_usage and every other table this schema accumulates by the time this feature is built; every existing query against these tables already filters by organization_id, audited against this feature, don't assume; M3 negative test per resource type proving a user in org A cannot read or write org B's usage rows by any query path. Acceptance: cross-org access is denied for distribution.prompt_usage, proven by test; RLS independently blocks cross-org access with the app-layer filter simulated as absent. Reuses the shared cross-tenant-denial test helper from epic 002, same as prompt_registry's own tenant-isolation feature."

**Supersedes**: This spec was drafted before `008-distribution/004-usage-telemetry` (shipped concurrently on `main` as `001-usage-telemetry`, commit `61f6926`) merged into this branch's base. That feature expanded `distribution.prompt_usage` with `promptVersion`/`statusCode`/`latencyMs`/`gitRemoteUrl`/`gitBranch`/`gitCommitSha` columns, added `getPromptUsageSummaryForOrganization`/`listForOrganizationWindow`, and gave `recordPromptUsage` its first real production callers (`POST /api/skills/{name}/expand`, `POST /api/chain-runs/{runId}/advance`). The scenarios and requirements below are updated to reflect that actual current schema and query surface — `distribution.prompt_usage` remains the only table in scope, and still has no RLS.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Distribution RLS blocks cross-organization access to usage data (Priority: P1)

As an engineer responsible for the Distribution bounded context, I need database-level tenant isolation on every Distribution table so another organization's prompt usage records cannot be read or changed even if an application query is missing its organization filter.

**Why this priority**: This is the M2 backstop for Distribution's tenant-scoped usage data. Without it, a missed service-layer filter could expose or corrupt another tenant's invocation history — including which skills were run, by whom, how often, with what status/latency, and (when supplied by the Skill Sync CLI) which git repository/branch/commit — which is sensitive operational data even though it carries no prompt content itself. This has real teeth now: `recordPromptUsage` is called from two live REST routes (`POST /api/skills/{name}/expand`, `POST /api/chain-runs/{runId}/advance`), and `GET /api/metrics`/`/metrics` read the aggregate back, so a missing filter is no longer a hypothetical future gap.

**Independent Test**: Can be tested by seeding a prompt usage row in organization B, running direct read and write attempts from a session scoped to organization A, and confirming the database denies or affects zero rows even when no application-layer organization filter is present.

**Acceptance Scenarios**:

1. **Given** a database session scoped to organization A and a prompt usage row belonging to organization B, **When** the session queries that row by exact ID without an application-layer organization filter, **Then** no usage data is returned.
2. **Given** a database session scoped to organization A and a prompt usage row belonging to organization B, **When** the session attempts to insert a usage row claiming organization B's identifier, or to update/delete an existing organization B row by exact ID, **Then** the write is denied or affects zero rows.

---

### User Story 2 - Distribution services keep organization filters as the primary control (Priority: P1)

As an engineer maintaining usage-recording and usage-summary reads, I need every service-layer query in scope to be reviewed and verified as scoped to the caller's organization, so RLS remains defense in depth rather than the only tenant boundary.

**Why this priority**: Tenets M1 and M2 require application-layer organization filtering first, with RLS as the backstop. The audit prevents Distribution from silently relying only on database policy behavior, and catches any query added since `024-project-usage-metrics-dashboard` shipped without this feature's scrutiny.

**Independent Test**: Can be tested by reviewing every read and write against `distribution.prompt_usage` (record-insert, count, list-since, group-by-skill, group-by-member, daily-counts-by-skill, list-for-organization-window), recording the audit result, and fixing any query that can target tenant-scoped rows without the caller's organization.

**Acceptance Scenarios**:

1. **Given** every query used by `recordPromptUsage`, `getPromptUsageSummaryForProject`'s internal reads, and `getPromptUsageSummaryForOrganization`'s internal reads, **When** it is audited for tenant scoping, **Then** each tenant-scoped read or write is confirmed to constrain access to the caller's organization.
2. **Given** a Distribution query missing the required organization filter, **When** it is found during the audit, **Then** the gap is fixed before this feature is complete.
3. **Given** any table added to the `distribution` schema after `001-usage-telemetry` and before this feature's implementation, **When** this feature is implemented, **Then** that table is included in both the RLS rollout and the query audit, not just `prompt_usage`.

---

### User Story 3 - Shared cross-tenant-denial helper covers Distribution's usage resource (Priority: P2)

As an engineer adding M3 coverage for Distribution, I need to reuse the shared cross-tenant-denial helper established by Identity Access (and already reused by Governance and Prompt Registry) so usage-record isolation tests follow the same proof pattern as earlier tenant-scoped resources.

**Why this priority**: Shared helper reuse keeps tenant-isolation tests consistent across bounded contexts and prevents a parallel Distribution-only helper from drifting away from the project-wide M3 contract.

**Independent Test**: Can be tested by applying the shared helper to one read/write denial case for a prompt usage row, then verifying it fails if cross-organization access unexpectedly succeeds.

**Acceptance Scenarios**:

1. **Given** the shared cross-tenant-denial helper, **When** it is applied to a prompt usage row owned by organization B using an organization A acting context, **Then** the helper proves both read and write denial by exact ID.
2. **Given** prompt usage's append-only, no-single-caller-facing-`getById` shape, **When** the shared helper cannot express the case directly, **Then** the helper is extended in a reusable way rather than replaced by a Distribution-only implementation.

### Edge Cases

- What happens when cross-organization access targets a valid ID for a usage row in another organization? The result is indistinguishable from a missing resource at the application boundary and returns no row or affects zero rows at the database boundary.
- What happens when the application-layer filter is intentionally absent in a test? RLS alone must still deny reads and writes for the usage resource outside the session organization.
- What happens when a usage row's `project_id`, `user_id`, `latency_ms`, or git-context fields (`git_remote_url`/`git_branch`/`git_commit_sha`) are null (an ad hoc/personal expansion, an ungoverned invocation, or an invocation with no git context, e.g. from the web UI)? Tenant scoping is still enforced purely by `organization_id` on the row itself; no nullable column weakens or bypasses the organization boundary.
- What happens when a session attempts to insert a usage row for a different organization than its own session context? RLS denies the insert regardless of what `organization_id` value the application layer supplies in the row.
- What happens if a new `distribution`-schema table exists by the time this feature is implemented but wasn't anticipated by this spec? Requirement FR-001 and the query audit apply to it too — this feature's scope is "every table in the schema at implementation time," not a fixed table list.
- What happens when administrative migrations or seed data setup need cross-organization access? They remain out of scope for ordinary runtime isolation and use the same privileged-role assumption established by the Identity Access RLS feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST enforce row-level security on `distribution.prompt_usage`, and on every other table present in the `distribution` schema at the time this feature is implemented, so a session scoped to one organization cannot read rows belonging to another organization.
- **FR-002**: System MUST enforce row-level security on `distribution.prompt_usage` (and any other in-scope table) so a session scoped to one organization cannot insert, update, or delete rows belonging to another organization.
- **FR-003**: RLS for Distribution resources MUST use the same session-scoped organization context mechanism established for tenant isolation in Identity Access and reused by Governance and Prompt Registry.
- **FR-004**: Every service-layer query that reads or writes `distribution.prompt_usage` (including `recordPromptUsage` and every internal read composed by `getPromptUsageSummaryForProject` and `getPromptUsageSummaryForOrganization`) MUST filter by the caller's `organization_id`.
- **FR-005**: Any query found during audit without the required organization filter MUST be corrected as part of this feature before completion.
- **FR-006**: Automated tests MUST prove that a user or session in organization A cannot read a prompt usage row belonging to organization B by exact ID.
- **FR-007**: Automated tests MUST prove that a user or session in organization A cannot write (insert claiming, update, or delete) a prompt usage row belonging to organization B by exact ID.
- **FR-008**: Automated tests MUST prove the same cross-organization read and write denials still hold when the application-layer `organization_id` filter is deliberately disabled or bypassed in the test scenario.
- **FR-009**: Distribution tenant-isolation tests MUST reuse the shared cross-tenant-denial test helper established by the Identity Access tenant isolation feature.
- **FR-010**: If the shared helper cannot represent prompt usage's setup or write shape directly (for example, its append-only insert-then-verify pattern rather than a mutable resource with its own update path), the helper MUST be extended in a reusable cross-context shape rather than forked for Distribution.
- **FR-011**: Cross-organization denial for the usage resource MUST NOT reveal that a resource exists in another organization.

### Key Entities

- **Prompt usage record**: An immutable, append-only row (`distribution.prompt_usage`) representing one genuine prompt expansion or accepted skill-chain step — organization, prompt, prompt version, status code, optional latency, optionally a project, an acting user, and git context (remote URL/branch/commit). Tenant-scoped by `organization_id`; must not be readable or writable from another organization.
- **Cross-tenant-denial test helper**: Shared developer-facing test utility established by the Identity Access tenant isolation feature and already reused by Governance and Prompt Registry. Distribution uses it to prove M3 denial for the usage resource.
- **Organization-scoped database session**: Runtime database context carrying the caller's organization identity for RLS evaluation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of tables in the `distribution` schema at implementation time have RLS enabled and verified by automated cross-organization denial tests.
- **SC-002**: For the usage resource, at least one automated test proves cross-organization read-by-ID denial and at least one automated test proves cross-organization write denial.
- **SC-003**: The cross-organization denial tests for the usage resource still pass when the application-layer organization filter is intentionally disabled or bypassed, proving RLS independently blocks access.
- **SC-004**: The Distribution query audit records zero remaining service-layer reads or writes that target `distribution.prompt_usage` (or any other in-scope table) without filtering by the caller's organization.
- **SC-005**: Distribution tenant-isolation tests use the shared helper path; any helper changes are reusable by later bounded contexts and do not introduce a Distribution-only duplicate.

## Assumptions

- As of this spec's update, `distribution.prompt_usage` (created by `024-project-usage-metrics-dashboard`, extended by `008-distribution/004-usage-telemetry`) is the only table in the `distribution` schema; this feature's scope is stated as "every table in the schema at implementation time" per the Open Question in the originating backlog item, and covers only `prompt_usage` unless another table has landed by then.
- `organization_id` is the canonical tenant key for `distribution.prompt_usage`, matching the column already present on the table; `project_id`, `user_id`, `latency_ms`, and the git-context columns are nullable and not independent tenant boundaries.
- Cross-organization denial should match the Identity Access, Governance, and Prompt Registry isolation features' "not found" behavior at application boundaries, because exposing a distinct forbidden response would confirm that another organization's resource exists.
- Administrative migrations, schema setup, and seed operations use the privileged-role pattern already established by the Identity Access RLS feature and are not constrained by ordinary runtime RLS behavior.
- There are no end-user-facing UI changes in this feature; completion is demonstrated through automated tests and a query-audit record. `GET /api/metrics`/`/metrics` already exist and already wrap their query in `withTenantContext` — this feature does not change their behavior, only backstops the table they read with RLS.
- `queryUsageByRepoAndCommits` (VCS Integration's planned read side over `git_remote_url`/`git_commit_sha`) remains unimplemented as of this spec — the git-context *columns* it will eventually read are real (shipped by `001-usage-telemetry`), but the function itself is still only a forward-looking `CONTRACT.md`/`OWNERSHIP.md` entry with no corresponding code. This feature does not implement it; RLS applied here will already cover it once it exists, since it targets the same table.
- PDR-015's 90-day retention floor for rows with a non-null `git_commit_sha` is a data-retention policy, not a tenant-isolation concern; this feature does not touch retention/rollup behavior.
