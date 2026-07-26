# Feature Specification: Governance Tenant Isolation Tests

**Feature Branch**: `001-governance-tenant-isolation-tests`

**Created**: 2026-07-26

**Status**: Clarified

**Input**: User description: "Governance Tenant Isolation Tests. Apply the RLS pattern and the shared cross-tenant-denial test helper from the Identity Access tenant isolation feature to governance.policies and governance.objectives, per tenets M1/M2/M3. RLS policies must be enabled on governance.policies and governance.objectives. Every query in this epic's policy and objective features must filter by organization_id and be audited against this feature. Add M3 negative tests per resource type proving a user in org A cannot read or write org B's policy or objective by ID. Acceptance: cross-org access by ID to policy or objective is denied for read and write paths; RLS independently blocks cross-org access even when the app-layer filter is simulated as absent; reuse the shared helper rather than forking it, extending it only if Governance resource shapes require it. Dependencies: 001-policy-model-and-crud.md, 002-objective-model-and-crud.md, backlog/002-identity-access/007-tenant-isolation-tests-and-rls.md."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Governance RLS blocks cross-organization access (Priority: P1)

As an engineer responsible for the Governance bounded context, I need database-level tenant isolation on governance policies and objectives so another organization's governance data cannot be read or changed even if an application query is missing its organization filter.

**Why this priority**: This is the M2 backstop for Governance's two tenant-scoped resource types. Without it, a missed service-layer filter could expose or mutate another tenant's policy or objective by ID.

**Independent Test**: Can be tested by seeding policies and objectives in organization B, running direct read and write attempts from a session scoped to organization A, and confirming the database denies or affects zero rows even when no application-layer organization filter is present.

**Acceptance Scenarios**:

1. **Given** a database session scoped to organization A and a policy belonging to organization B, **When** the session queries that policy by exact ID without an application-layer organization filter, **Then** no policy data is returned.
2. **Given** a database session scoped to organization A and a policy belonging to organization B, **When** the session attempts to update, deactivate, or delete that policy by exact ID without an application-layer organization filter, **Then** the write affects zero rows.
3. **Given** a database session scoped to organization A and an objective belonging to organization B, **When** the session queries that objective by exact ID without an application-layer organization filter, **Then** no objective data is returned.
4. **Given** a database session scoped to organization A and an objective belonging to organization B, **When** the session attempts to update or delete that objective by exact ID without an application-layer organization filter, **Then** the write affects zero rows.

---

### User Story 2 - Governance services keep organization filters as the primary control (Priority: P1)

As an engineer maintaining policy and objective CRUD, I need every service-layer query introduced by those features to be reviewed and verified as scoped to the caller's organization, so RLS remains defense in depth rather than the only tenant boundary.

**Why this priority**: Tenets M1 and M2 require application-layer organization filtering first, with RLS as the backstop. The audit prevents Governance from silently relying only on database policy behavior.

**Independent Test**: Can be tested by reviewing every policy and objective read/write/list query from the dependent specs, recording the audit result, and fixing any query that can target tenant-scoped rows without the caller's organization.

**Acceptance Scenarios**:

1. **Given** every query used by policy create/get/update/delete/list operations, **When** it is audited for tenant scoping, **Then** each tenant-scoped read or write is confirmed to constrain access to the caller's organization.
2. **Given** every query used by objective create/get/update/delete/list operations, **When** it is audited for tenant scoping, **Then** each tenant-scoped read or write is confirmed to constrain access to the caller's organization.
3. **Given** a governance query missing the required organization filter, **When** it is found during the audit, **Then** the gap is fixed before this feature is complete.

---

### User Story 3 - Shared cross-tenant-denial helper covers Governance resources (Priority: P2)

As an engineer adding M3 coverage for Governance, I need to reuse the shared cross-tenant-denial helper established by Identity Access so policy and objective isolation tests follow the same proof pattern as earlier tenant-scoped resources.

**Why this priority**: Shared helper reuse keeps tenant-isolation tests consistent across bounded contexts and prevents a parallel Governance-only helper from drifting away from the project-wide M3 contract.

**Independent Test**: Can be tested by applying the shared helper to one policy read/write denial case and one objective read/write denial case, then verifying both fail if cross-organization access unexpectedly succeeds.

**Acceptance Scenarios**:

1. **Given** the shared cross-tenant-denial helper from the Identity Access tenant isolation feature, **When** it is applied to a policy owned by organization B using an organization A acting context, **Then** the helper proves both read and write denial for that policy by exact ID.
2. **Given** the shared cross-tenant-denial helper from the Identity Access tenant isolation feature, **When** it is applied to an objective owned by organization B using an organization A acting context, **Then** the helper proves both read and write denial for that objective by exact ID.
3. **Given** Governance resource setup requires additional fixture shape or write-operation adapters, **When** the shared helper cannot express the case directly, **Then** the helper is extended in a reusable way rather than replaced by a Governance-only implementation.

### Edge Cases

- What happens when cross-organization access targets a valid ID for a resource in another organization? The result is indistinguishable from a missing resource at the application boundary and returns no row or affects zero rows at the database boundary.
- What happens when the application-layer filter is intentionally absent in a test? RLS alone must still deny reads and writes for policies and objectives outside the session organization.
- What happens when the resource under test has indirect scope relationships, such as a policy attached to a team/project or an objective attached to team/project/user/parent objective references? The test fixture must still prove denial based on the resource's owning organization, regardless of narrower scopes.
- What happens when administrative migrations or seed data setup need cross-organization access? They remain out of scope for ordinary runtime isolation and use the same privileged-role assumption established by the Identity Access RLS feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST enforce row-level security on `governance.policies` so a session scoped to one organization cannot read policies belonging to another organization.
- **FR-002**: System MUST enforce row-level security on `governance.policies` so a session scoped to one organization cannot update, deactivate, or delete policies belonging to another organization.
- **FR-003**: System MUST enforce row-level security on `governance.objectives` so a session scoped to one organization cannot read objectives belonging to another organization.
- **FR-004**: System MUST enforce row-level security on `governance.objectives` so a session scoped to one organization cannot update or delete objectives belonging to another organization.
- **FR-005**: RLS for Governance resources MUST use the same session-scoped organization context mechanism established for tenant isolation in Identity Access.
- **FR-006**: Every policy service-layer query that reads or writes tenant-scoped policy rows MUST filter by the caller's `organization_id`.
- **FR-007**: Every objective service-layer query that reads or writes tenant-scoped objective rows MUST filter by the caller's `organization_id`.
- **FR-008**: Any policy or objective query found during audit without the required organization filter MUST be corrected as part of this feature before completion.
- **FR-009**: Automated tests MUST prove that a user or session in organization A cannot read a policy belonging to organization B by exact ID.
- **FR-010**: Automated tests MUST prove that a user or session in organization A cannot write to a policy belonging to organization B by exact ID.
- **FR-011**: Automated tests MUST prove that a user or session in organization A cannot read an objective belonging to organization B by exact ID.
- **FR-012**: Automated tests MUST prove that a user or session in organization A cannot write to an objective belonging to organization B by exact ID.
- **FR-013**: Automated tests MUST prove the same cross-organization read and write denials still hold when the application-layer `organization_id` filter is deliberately disabled or bypassed in the test scenario.
- **FR-014**: Governance tenant-isolation tests MUST reuse the shared cross-tenant-denial helper from the Identity Access tenant isolation feature.
- **FR-015**: If the shared helper cannot represent Governance's policy or objective setup directly, the helper MUST be extended in a reusable cross-context shape rather than forked for Governance.
- **FR-016**: Cross-organization denial for policies and objectives MUST NOT reveal that a resource exists in another organization.

### Key Entities

- **Policy**: A Governance rule owned by one organization and scoped to exactly one team or project. It is tenant-scoped by its `organization_id` and must not be readable or writable from another organization.
- **Objective**: A Governance goal owned by one organization with optional team, project, user, and parent-objective relationships. It is tenant-scoped by its `organization_id` and must not be readable or writable from another organization.
- **Cross-tenant-denial test helper**: Shared developer-facing test utility established by the Identity Access tenant isolation feature. Governance uses it to prove M3 denial for both policies and objectives.
- **Organization-scoped database session**: Runtime database context carrying the caller's organization identity for RLS evaluation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of Governance tenant-scoped tables named by this feature (`governance.policies`, `governance.objectives`) have RLS enabled and verified by automated cross-organization denial tests.
- **SC-002**: For both Governance resource types, at least one automated test proves cross-organization read-by-ID denial and at least one automated test proves cross-organization write-by-ID denial.
- **SC-003**: The cross-organization denial tests for both resource types still pass when the application-layer organization filter is intentionally disabled or bypassed, proving RLS independently blocks access.
- **SC-004**: The policy and objective query audit records zero remaining service-layer reads or writes that target tenant-scoped rows without filtering by the caller's organization.
- **SC-005**: Governance tenant-isolation tests use the shared helper path; any helper changes are reusable by later bounded contexts and do not introduce a Governance-only duplicate.

## Assumptions

- Policy and objective model/CRUD features exist before this feature is implemented; this feature verifies and hardens their tenant isolation rather than defining their full CRUD behavior.
- `organization_id` is the canonical tenant key for Governance policies and objectives, matching the dependent policy and objective specs.
- Cross-organization denial should match the Identity Access isolation feature's "not found" behavior at application boundaries, because exposing a distinct forbidden response would confirm that another organization's resource exists.
- Administrative migrations, schema setup, and seed operations use the privileged-role pattern already established by the Identity Access RLS feature and are not constrained by ordinary runtime RLS behavior.
- There are no end-user-facing UI changes in this feature; completion is demonstrated through automated tests and a query-audit record.
