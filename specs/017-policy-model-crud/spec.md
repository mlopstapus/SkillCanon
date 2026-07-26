# Feature Specification: Policy Model & CRUD

**Feature Branch**: `017-policy-model-crud`

**Created**: 2026-07-26

**Status**: Clarified

**Input**: User description: "Policy Model & CRUD (epic 005-governance, backlog item backlog/005-governance/001-policy-model-and-crud.md). Port `Policy` from the current Python `models.py`/`policy_service.py` create/get/update/delete/list operations, scoped under `Organization`, into the new TypeScript `src/bcs/governance` bounded context, per `src/bcs/governance/CONTRACT.md`."

## Clarifications

### Session 2026-07-26

- Q: Does the `005-governance-views-ui` mockup's 3-value "New policy" enforcement-type drawer (`prepend`/`append`/`inject`, omitting `validate`) constrain this feature's schema/enum to 3 values, or does the schema keep the real 4th value (`validate`)? → A: The mockup is a visual/design reference only; it does not constrain the schema. This feature's enum keeps all four values (`prepend`/`append`/`inject`/`validate`); the UI mockup must be reconciled to match this schema when that feature is built, not the reverse. (Answered by Benjamin Anderson, project owner, on the issue tracker, 2026-07-26.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a policy at a single, unambiguous scope (Priority: P1)

An organization admin (or an internal caller acting on their behalf, e.g. a route handler) creates a governance policy attached to exactly one scope — either a team or a project — within their own organization.

**Why this priority**: Without a correctly-scoped create operation nothing else in this feature (or in downstream features like the resolution engine) has anything to read. This is the foundational capability.

**Independent Test**: Can be fully tested by calling create with a valid team-scoped (or project-scoped) payload and confirming a policy row exists with the right scope, is active, and an audit event was recorded — no other operation needs to exist yet.

**Acceptance Scenarios**:

1. **Given** a caller in organization A with a team belonging to organization A, **When** they create a policy naming that team as the scope, **Then** the policy is created, scoped to that team, active, and a `PolicyCreated` audit event is recorded.
2. **Given** a caller in organization A with a project belonging to organization A, **When** they create a policy naming that project as the scope, **Then** the policy is created, scoped to that project, active, and a `PolicyCreated` audit event is recorded.
3. **Given** a caller in organization A, **When** they attempt to create a policy naming both a team and a project as scope, **Then** the creation is rejected and no policy or audit event is created.
4. **Given** a caller in organization A, **When** they attempt to create a policy naming neither a team nor a project, **Then** the creation is rejected and no policy or audit event is created.
5. **Given** a caller in organization A, **When** they attempt to create a policy scoped to a team or project that belongs to organization B, **Then** the creation is rejected and no policy or audit event is created.

---

### User Story 2 - Read, update, and deactivate an existing policy (Priority: P2)

An organization admin looks up a single policy by id, changes its editable fields (name, description, enforcement type, content, priority), or deactivates it once it's no longer needed — without being able to reassign it to a different organization's scope.

**Why this priority**: Once policies exist, they need to be correctable and retirable; this is standard lifecycle management that every admin-facing governance workflow depends on, but it isn't needed to prove the model works end to end (P1 already does that).

**Independent Test**: Can be fully tested by creating a policy, then independently exercising get/update/delete against it and confirming each produces the expected state change and audit event, without needing the list operations from User Story 3.

**Acceptance Scenarios**:

1. **Given** an existing policy in the caller's organization, **When** the caller fetches it by id, **Then** its current fields are returned.
2. **Given** an existing policy in the caller's organization, **When** the caller updates its name, description, enforcement type, content, or priority, **Then** the change is saved and a `PolicyUpdated` audit event is recorded.
3. **Given** an existing policy in the caller's organization, **When** the caller deletes/deactivates it, **Then** it is marked inactive and a `PolicyDeactivated` audit event is recorded.
4. **Given** a policy that belongs to a different organization, **When** the caller attempts to get, update, or delete it, **Then** the operation is rejected as if the policy did not exist.

---

### User Story 3 - List the active policies at a team or project scope (Priority: P3)

An organization admin (or the resolution engine that depends on this feature) lists all currently-active policies attached directly to a given team or a given project, ordered so the highest-priority policy comes first.

**Why this priority**: Listing is what makes the created/updated policies actually useful to consumers (admin UI, resolution engine), but it's a read path that composes cleanly on top of P1/P2 and can be validated last.

**Independent Test**: Can be fully tested by creating several policies at a scope with different priorities and active/inactive states, then confirming the list operation returns only the active ones in priority-descending order.

**Acceptance Scenarios**:

1. **Given** a team with three active policies of differing priority and one inactive policy, **When** the caller lists that team's policies, **Then** exactly the three active policies are returned, ordered from highest to lowest priority.
2. **Given** a project with active policies, **When** the caller lists that project's policies, **Then** exactly its active policies are returned, ordered from highest to lowest priority.
3. **Given** a team or project with no active policies, **When** the caller lists its policies, **Then** an empty list is returned.

---

### Edge Cases

- What happens when a caller tries to update a policy's scope (team/project) directly, rather than through create? Scope reassignment after creation is out of scope for this feature — the "exactly one of team/project" and same-organization invariants only need to be enforced at create time; update only touches the editable fields listed in User Story 2.
- How does the system handle a create/update naming a team or project id that doesn't exist at all (not just belonging to another organization)? Treated the same as "belongs to another organization" — rejected, no policy or audit event created.
- What happens to a policy when its owning team or project is later deleted? Out of scope for this feature; governed by whatever deletion/lifecycle rules the Identity/Access and Prompt Registry bounded contexts already define for teams/projects.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a caller to create a policy scoped to exactly one of a team or a project, both of which must belong to the caller's own organization.
- **FR-002**: System MUST reject policy creation when both a team scope and a project scope are supplied.
- **FR-003**: System MUST reject policy creation when neither a team scope nor a project scope is supplied.
- **FR-004**: System MUST reject policy creation when the supplied team or project does not belong to the caller's own organization.
- **FR-005**: System MUST allow a caller to fetch a single policy belonging to their own organization by id.
- **FR-006**: System MUST allow a caller to update a policy's name, description, enforcement type, content, and priority, without changing its scope or organization.
- **FR-007**: System MUST allow a caller to deactivate (soft-delete) a policy belonging to their own organization.
- **FR-008**: System MUST treat a policy belonging to a different organization as inaccessible (as if it did not exist) for get, update, and delete.
- **FR-009**: System MUST allow a caller to list all currently-active policies directly scoped to a given team, ordered from highest to lowest priority.
- **FR-010**: System MUST allow a caller to list all currently-active policies directly scoped to a given project, ordered from highest to lowest priority.
- **FR-011**: System MUST exclude deactivated (inactive) policies from both list operations.
- **FR-012**: System MUST record an audit event for every policy create, update, and deactivate operation, identifying the organization, the affected policy, its scope, and the acting user.
- **FR-013**: System MUST support the four enforcement-type values already established for this domain (`prepend`, `append`, `inject`, `validate`) as valid values for a policy's enforcement type; the model is not limited to a subset of these values based on any particular consumer's current UI (see Assumptions).

### Key Entities

- **Policy**: A governance rule attached to exactly one scope (a team or a project) within an organization. Key attributes: name, description, enforcement type (how the rule is applied — prepended, appended, injected, or used as validation), content (the rule body/skill name), priority (determines ordering among policies at the same scope), and active/inactive status. Belongs to exactly one organization and exactly one of a team or a project.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every create/update/deactivate operation against a policy produces a corresponding, immediately-queryable audit record — verified with zero gaps across a full characterization-test pass against current Python behavior.
- **SC-002**: 100% of attempts to create a policy with an invalid scope (both team and project, neither, or a scope from another organization) are rejected, with zero such policies ever persisted.
- **SC-003**: Listing a team's or project's policies returns exactly its active policies in priority-descending order, matching the current Python implementation's output byte-for-byte across the full characterization-test suite.
- **SC-004**: A policy belonging to another organization is never returned or modifiable by a caller outside that organization, across 100% of get/update/delete attempts in the test suite.

## Assumptions

- The `enforcement_type` value set for this feature is the four values already defined in the current Python model and in `bcs/governance/CONTRACT.md`'s data contract: `prepend`, `append`, `inject`, `validate`. A separate UI mockup for a not-yet-built policy-management screen currently shows only three of these four in its "new policy" form; per the project owner's direction (2026-07-26), that mockup is a visual/design reference only and does not constrain this feature's schema or enum — the mockup's UI will be reconciled to the real four-value set (and, per `CONTRACT.md`, a later fifth value `require-skill` added by a separate future feature) when that UI feature is built, not the reverse.
- "Caller" in this spec means an authenticated actor already resolved to an organization and a user identity by the Identity/Access bounded context (org/team/project membership and auth are out of scope here — this feature assumes that context is already available, per its listed dependency on the Identity/Access epic).
- Every mutation's audit event is written through the shared audit write path established by the Audit & Compliance epic's event schema feature, which this feature depends on rather than re-implementing.
- Scope reassignment (moving an existing policy from one team/project to another after creation) is out of scope; only the fields listed in FR-006 are editable via update.
