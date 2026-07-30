# Feature Specification: Prompt Registry Tenant Isolation Tests

**Feature Branch**: `022-prompt-registry-tenant-isolation`

**Created**: 2026-07-29

**Status**: Clarified

**Input**: User description: "Prompt Registry Tenant Isolation Tests (Epic 006: Prompt Registry). Apply the RLS pattern and the shared cross-tenant-denial test helper (established by the Identity Access tenant isolation feature and reused by Governance's own tenant isolation feature) to prompt_registry.projects, prompt_registry.project_teams, prompt_registry.prompts, prompt_registry.prompt_versions, prompt_registry.subscriptions, and prompt_registry.project_skill_assignments, per tenets M1/M2/M3. This table list reflects PDR-016's redesign (docs/pdr/016-skill-ownership-sharing-and-project-assignment.md): the originally-planned prompt_shares table was replaced by subscriptions, and project_teams/project_skill_assignments were added as new tables. RLS policies must be enabled on all six tables in this schema. Every query in this epic's other features (001 project model & membership, 002 prompt & version model, 003 skill sharing subscribe & fork, 007 project skill assignment) must filter by organization_id and be audited against this feature. Add M3 negative tests per resource type proving a user in org A cannot read or write org B's project, collaborator-team link, prompt, version, subscription, or project-skill assignment by ID. Acceptance: cross-org access by ID is denied for each resource type, proven by test; RLS independently blocks cross-org access even when the app-layer organization_id filter is simulated as absent; reuse the shared cross-tenant-denial helper rather than forking it, extending it only if Prompt Registry's resource shapes require it. Prompt sharing (subscribe/fork) and project-skill assignment are intra-org by design — this feature's tests confirm cross-organization access is denied, not that sharing or assignment themselves are restrictive within an organization. Dependencies: backlog/006-prompt-registry/001-project-model-and-membership.md, 002-prompt-and-version-model.md, 003-prompt-sharing.md, 007-project-skill-assignment.md, and backlog/002-identity-access/007-tenant-isolation-tests-and-rls.md."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prompt Registry RLS blocks cross-organization access (Priority: P1)

As an engineer responsible for the Prompt Registry bounded context, I need database-level tenant isolation on every Prompt Registry table so another organization's projects, collaborator-team links, skills, versions, subscriptions, and project-skill assignments cannot be read or changed even if an application query is missing its organization filter.

**Why this priority**: This is the M2 backstop for Prompt Registry's six tenant-scoped tables. Without it, a missed service-layer filter could expose or mutate another tenant's project, skill, version, subscription, collaborator-team link, or project-skill assignment by ID.

**Independent Test**: Can be tested by seeding a project, a collaborator-team link, a skill (prompt), a prompt version, a subscription, and a project-skill assignment in organization B, running direct read and write attempts from a session scoped to organization A, and confirming the database denies or affects zero rows even when no application-layer organization filter is present.

**Acceptance Scenarios**:

1. **Given** a database session scoped to organization A and a project belonging to organization B, **When** the session queries that project by exact ID without an application-layer organization filter, **Then** no project data is returned.
2. **Given** a database session scoped to organization A and a project (with a collaborator-team link) belonging to organization B, **When** the session attempts to update, delete, or manage the collaborator-team link on that project by exact ID without an application-layer organization filter, **Then** the write affects zero rows.
3. **Given** a database session scoped to organization A and a skill (prompt) belonging to organization B, **When** the session queries or writes to that skill by exact ID without an application-layer organization filter, **Then** no data is returned and no write occurs.
4. **Given** a database session scoped to organization A and a prompt version belonging to a skill in organization B, **When** the session queries that version by exact ID without an application-layer organization filter, **Then** no version data is returned.
5. **Given** a database session scoped to organization A and a subscription belonging to organization B, **When** the session queries or writes to that subscription by exact ID without an application-layer organization filter, **Then** no data is returned and no write occurs.
6. **Given** a database session scoped to organization A and a project-skill assignment belonging to organization B, **When** the session queries or writes to that assignment by exact ID without an application-layer organization filter, **Then** no data is returned and no write occurs.

---

### User Story 2 - Prompt Registry services keep organization filters as the primary control (Priority: P1)

As an engineer maintaining project, skill/version, sharing, and project-skill-assignment CRUD, I need every service-layer query introduced by those features to be reviewed and verified as scoped to the caller's organization, so RLS remains defense in depth rather than the only tenant boundary.

**Why this priority**: Tenets M1 and M2 require application-layer organization filtering first, with RLS as the backstop. The audit prevents Prompt Registry from silently relying only on database policy behavior.

**Independent Test**: Can be tested by reviewing every project, project-team, prompt/version, subscription/fork, and project-skill-assignment read/write/list query from the dependent features, recording the audit result, and fixing any query that can target tenant-scoped rows without the caller's organization.

**Acceptance Scenarios**:

1. **Given** every query used by project create/update/delete/list and member/collaborator-team add/remove operations, **When** it is audited for tenant scoping, **Then** each tenant-scoped read or write is confirmed to constrain access to the caller's organization.
2. **Given** every query used by prompt/version create/publish/deprecate/rollback/list/get operations, **When** it is audited for tenant scoping, **Then** each tenant-scoped read or write is confirmed to constrain access to the caller's organization.
3. **Given** every query used by subscribe/unsubscribe/fork operations, **When** it is audited for tenant scoping, **Then** each tenant-scoped read or write is confirmed to constrain access to the caller's organization.
4. **Given** every query used by project-skill assignment/unassignment/listing operations, **When** it is audited for tenant scoping, **Then** each tenant-scoped read or write is confirmed to constrain access to the caller's organization.
5. **Given** a Prompt Registry query missing the required organization filter, **When** it is found during the audit, **Then** the gap is fixed before this feature is complete.

---

### User Story 3 - Shared cross-tenant-denial helper covers all six Prompt Registry resource types (Priority: P2)

As an engineer adding M3 coverage for Prompt Registry, I need to reuse the shared cross-tenant-denial helper established by Identity Access (and already reused by Governance) so project, collaborator-team, skill, version, subscription, and project-skill-assignment isolation tests follow the same proof pattern as earlier tenant-scoped resources.

**Why this priority**: Shared helper reuse keeps tenant-isolation tests consistent across bounded contexts and prevents a parallel Prompt-Registry-only helper from drifting away from the project-wide M3 contract.

**Independent Test**: Can be tested by applying the shared helper to one read/write denial case per resource type (project, collaborator-team link, skill, version, subscription, project-skill assignment), then verifying each fails if cross-organization access unexpectedly succeeds.

**Acceptance Scenarios**:

1. **Given** the shared cross-tenant-denial helper, **When** it is applied to a project (and its collaborator-team link) owned by organization B using an organization A acting context, **Then** the helper proves both read and write denial by exact ID.
2. **Given** the shared cross-tenant-denial helper, **When** it is applied to a skill and one of its versions owned by organization B using an organization A acting context, **Then** the helper proves both read and write denial by exact ID for each.
3. **Given** the shared cross-tenant-denial helper, **When** it is applied to a subscription and a project-skill assignment owned by organization B using an organization A acting context, **Then** the helper proves both read and write denial by exact ID for each.
4. **Given** Prompt Registry resource setup requires additional fixture shape or write-operation adapters (for example, the polymorphic `subscriber_type`/`subscriber_id` shape on subscriptions, or the owner-team/collaborator-team shape on projects), **When** the shared helper cannot express the case directly, **Then** the helper is extended in a reusable way rather than replaced by a Prompt-Registry-only implementation.

### Edge Cases

- What happens when cross-organization access targets a valid ID for a resource in another organization? The result is indistinguishable from a missing resource at the application boundary and returns no row or affects zero rows at the database boundary.
- What happens when the application-layer filter is intentionally absent in a test? RLS alone must still deny reads and writes for all six resource types outside the session organization.
- What happens when a resource's tenant scope must be resolved indirectly, such as a prompt version (scoped through its parent skill) or a project-skill assignment (naming a project and a skill that must themselves belong to the acting organization)? The test fixture must still prove denial based on the resource's owning organization, regardless of the indirection.
- What happens when a subscription's or a project-skill assignment's own organization-scoped columns disagree with the organization of the resource it references (for example, a subscription row claiming organization A while its `source_skill_id` points at a skill actually owned by organization B)? This is an application-layer data-integrity invariant enforced by the dependent features (003, 007), not a case RLS is expected to independently detect; this feature's tests assume referenced rows are always same-organization as their parent, per those features' own invariants.
- What happens when Prompt Registry sharing (subscribe/fork) or project-skill assignment is exercised entirely within one organization? These stay intentionally permissive within an organization — this feature does not add restrictions there, only proves cross-*organization* access is denied.
- What happens when administrative migrations or seed data setup need cross-organization access? They remain out of scope for ordinary runtime isolation and use the same privileged-role assumption established by the Identity Access RLS feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST enforce row-level security on `prompt_registry.projects` so a session scoped to one organization cannot read projects belonging to another organization.
- **FR-002**: System MUST enforce row-level security on `prompt_registry.projects` so a session scoped to one organization cannot update or delete projects belonging to another organization.
- **FR-003**: System MUST enforce row-level security on `prompt_registry.project_teams` so a session scoped to one organization cannot read or write collaborator-team links belonging to a project in another organization.
- **FR-004**: System MUST enforce row-level security on `prompt_registry.prompts` so a session scoped to one organization cannot read or write skills belonging to another organization.
- **FR-005**: System MUST enforce row-level security on `prompt_registry.prompt_versions` so a session scoped to one organization cannot read or write versions belonging to a skill in another organization.
- **FR-006**: System MUST enforce row-level security on `prompt_registry.subscriptions` so a session scoped to one organization cannot read or write subscriptions belonging to another organization.
- **FR-007**: System MUST enforce row-level security on `prompt_registry.project_skill_assignments` so a session scoped to one organization cannot read or write project-skill assignments belonging to another organization.
- **FR-008**: RLS for Prompt Registry resources MUST use the same session-scoped organization context mechanism established for tenant isolation in Identity Access and reused by Governance.
- **FR-009**: Every service-layer query in features 001 (project model & membership), 002 (prompt & version model), 003 (skill sharing — subscribe & fork), and 007 (project skill assignment) that reads or writes tenant-scoped rows MUST filter by the caller's `organization_id`.
- **FR-010**: Any query found during audit without the required organization filter MUST be corrected as part of this feature before completion.
- **FR-011**: Automated tests MUST prove that a user or session in organization A cannot read or write a project belonging to organization B by exact ID.
- **FR-012**: Automated tests MUST prove that a user or session in organization A cannot read or write a project's collaborator-team link belonging to organization B by exact ID.
- **FR-013**: Automated tests MUST prove that a user or session in organization A cannot read or write a skill (prompt) belonging to organization B by exact ID.
- **FR-014**: Automated tests MUST prove that a user or session in organization A cannot read or write a prompt version belonging to a skill in organization B by exact ID.
- **FR-015**: Automated tests MUST prove that a user or session in organization A cannot read or write a subscription belonging to organization B by exact ID.
- **FR-016**: Automated tests MUST prove that a user or session in organization A cannot read or write a project-skill assignment belonging to organization B by exact ID.
- **FR-017**: Automated tests MUST prove the same cross-organization read and write denials still hold, for every resource type in scope, when the application-layer `organization_id` filter is deliberately disabled or bypassed in the test scenario.
- **FR-018**: Prompt Registry tenant-isolation tests MUST reuse the shared cross-tenant-denial test helper established by the Identity Access tenant isolation feature.
- **FR-019**: If the shared helper cannot represent a Prompt Registry resource's setup directly, the helper MUST be extended in a reusable cross-context shape rather than forked for Prompt Registry.
- **FR-020**: Cross-organization denial for every resource type in scope MUST NOT reveal that a resource exists in another organization.
- **FR-021**: This feature MUST NOT restrict subscribe, fork, or project-skill assignment behavior *within* a single organization; only cross-organization access is denied by this feature's requirements.

### Key Entities

- **Project**: A Prompt Registry workspace owned by an organization, with exactly one owner team (admin rights) plus any number of collaborator teams. Tenant-scoped by `organization_id`; must not be readable or writable from another organization.
- **Project-team link (collaborator team)**: A many-to-many association between a project and a collaborator team, scoped to the project's owning organization. Must not be readable or writable from another organization.
- **Skill (Prompt)**: A named, versioned prompt definition owned by exactly one user or exactly one team, never derived from a project. Tenant-scoped by `organization_id`; must not be readable or writable from another organization.
- **Prompt version**: An immutable version record belonging to exactly one skill. Tenant-scoped indirectly through its parent skill's `organization_id`; must not be readable or writable from another organization.
- **Subscription**: A live-reference sharing grant from one skill to one subscriber (a user or a team), scoped to a single organization. Must not be readable or writable from another organization; unaffected by this feature within its own organization.
- **Project-skill assignment**: A record marking a skill as `required` or `optional` for a project, scoped to the project's organization. Must not be readable or writable from another organization; unaffected by this feature within its own organization.
- **Cross-tenant-denial test helper**: Shared developer-facing test utility established by the Identity Access tenant isolation feature and already reused by Governance. Prompt Registry uses it to prove M3 denial for all six resource types above.
- **Organization-scoped database session**: Runtime database context carrying the caller's organization identity for RLS evaluation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of Prompt Registry tenant-scoped tables named by this feature (`prompt_registry.projects`, `prompt_registry.project_teams`, `prompt_registry.prompts`, `prompt_registry.prompt_versions`, `prompt_registry.subscriptions`, `prompt_registry.project_skill_assignments`) have RLS enabled and verified by automated cross-organization denial tests.
- **SC-002**: For each of the six resource types, at least one automated test proves cross-organization read-by-ID denial and at least one automated test proves cross-organization write-by-ID denial.
- **SC-003**: The cross-organization denial tests for all six resource types still pass when the application-layer organization filter is intentionally disabled or bypassed, proving RLS independently blocks access.
- **SC-004**: The Prompt Registry query audit (covering features 001, 002, 003, and 007) records zero remaining service-layer reads or writes that target tenant-scoped rows without filtering by the caller's organization.
- **SC-005**: Prompt Registry tenant-isolation tests use the shared helper path; any helper changes are reusable by later bounded contexts and do not introduce a Prompt-Registry-only duplicate.

## Assumptions

- Features 001 (project model & membership, including `project_teams`), 002 (prompt & version model), 003 (skill sharing — subscribe & fork), and 007 (project skill assignment) exist and their tables (`projects`, `project_teams`, `prompts`, `prompt_versions`, `subscriptions`, `project_skill_assignments`) are present before this feature is implemented; this feature verifies and hardens their tenant isolation rather than defining their full CRUD behavior. As of this spec's creation, `002`'s `prompts`/`prompt_versions` and part of `003`'s `subscriptions` already exist in code, while `001`'s `project_teams` and all of `007`'s `project_skill_assignments` do not yet — implementation of this feature is blocked on those tables landing.
- `organization_id` is the canonical tenant key for every table in scope, matching the dependent feature specs; `prompt_versions` and any polymorphic subscriber/assignment reference are scoped indirectly through their parent skill/project's `organization_id`.
- Cross-organization denial should match the Identity Access and Governance isolation features' "not found" behavior at application boundaries, because exposing a distinct forbidden response would confirm that another organization's resource exists.
- Administrative migrations, schema setup, and seed operations use the privileged-role pattern already established by the Identity Access RLS feature and are not constrained by ordinary runtime RLS behavior.
- There are no end-user-facing UI changes in this feature; completion is demonstrated through automated tests and a query-audit record.
