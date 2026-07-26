# Feature Specification: Objective Model & CRUD

**Feature Branch**: `001-objective-model-crud`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "backlog/005-governance/002-objective-model-and-crud.md - Port Objective from the current Python models.py/objective_service.py, scoped under Organization. Unlike Policy, Objective supports its own internal parent/child tree (parent_objective_id) in addition to team/project/user scoping. Validate team/project/user scope ownership, reject parent cycles, match current Python CRUD behavior, and audit ObjectiveCreated/ObjectiveUpdated mutations per the governance contract."

## Clarifications

### Session 2026-07-26

- Q: Should delete remain a hard delete with a new ObjectiveDeleted audit event, become a status update audited as ObjectiveUpdated, or be excluded from this feature's audited mutation scope? -> A: Keep hard delete and add `ObjectiveDeleted`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage scoped objectives (Priority: P1)

A caller records objectives for an organization and optionally attaches each objective to a team, project, user, or a combination of those scopes so governance views and later prompt expansion can reflect the goals that apply to each organizational context.

**Why this priority**: Objective CRUD is the foundation for every downstream governance workflow. Without correct create, read, update, delete, and list behavior, neither the UI nor the resolution engine has trustworthy objective data to consume.

**Independent Test**: Create objectives for a team, a project, a user, and the organization as a whole; retrieve each by id; list active objectives by each supported scope; update mutable fields; delete an objective; and verify the results match the current Python service behavior for equivalent inputs while adding the clarified audit event for deletion.

**Acceptance Scenarios**:

1. **Given** a caller acting within organization A, **When** they create an objective with a valid title and no narrower scope, **Then** the objective is created under organization A with default active status and can be retrieved by id.
2. **Given** a caller acting within organization A and a team/project/user that also belongs to organization A, **When** they create an objective scoped to that entity, **Then** the objective is created and appears in active objective lists for that scope.
3. **Given** an existing active objective, **When** its title, description, or status is updated, **Then** the objective reflects only the supplied changes and its organization and scope references remain unchanged.
4. **Given** an existing objective, **When** it is deleted, **Then** subsequent reads by id do not return it, active lists no longer include it, and an ObjectiveDeleted audit event records the deletion.

---

### User Story 2 - Preserve organization boundaries (Priority: P1)

The system refuses to attach an objective in one organization to a team, project, user, or parent objective that belongs to a different organization, preventing governance data from crossing tenant boundaries silently.

**Why this priority**: Governance is a core multi-tenant domain. A cross-organization objective link is both a data leak risk and a correctness failure for resolution.

**Independent Test**: Seed two organizations with teams, projects, users, and objectives. Attempt every cross-organization combination for create and update operations, and verify each is rejected with no partial state change.

**Acceptance Scenarios**:

1. **Given** organization A and organization B, **When** a caller in organization A creates an objective referencing a team from organization B, **Then** the request is rejected and no objective is created.
2. **Given** organization A and organization B, **When** a caller in organization A creates an objective referencing a project from organization B or a user from organization B, **Then** the request is rejected and no objective is created.
3. **Given** an existing objective in organization A, **When** an update attempts to attach it to a parent objective from organization B, **Then** the request is rejected and the objective remains unchanged.

---

### User Story 3 - Maintain objective trees safely (Priority: P2)

A caller can organize objectives into parent/child trees, while the system prevents any direct or indirect cycle that would make resolution, display, or maintenance ambiguous.

**Why this priority**: Parent-child objectives are a defining difference from Policy. They can be added after basic CRUD, but cycle prevention must be correct before the tree is trusted by downstream governance views or resolution.

**Independent Test**: Build a multi-level objective tree, update parent links through valid moves, and separately attempt self-parenting and descendant-as-parent updates. Verify valid moves persist and invalid cycle-forming changes are rejected without changing the tree.

**Acceptance Scenarios**:

1. **Given** a parent objective and a child objective in the same organization, **When** the child is created or updated with the parent objective as its parent, **Then** the relationship is accepted.
2. **Given** an objective, **When** it is created or updated with itself as its parent, **Then** the request is rejected and no parent link changes.
3. **Given** a tree A -> B -> C, **When** A is updated to use C as its parent, **Then** the request is rejected because it would create a cycle.

---

### User Story 4 - Produce auditable objective mutations (Priority: P2)

Every accepted objective mutation leaves an audit record that identifies the organization, objective, and actor, so administrators can later reconstruct who changed governance objectives.

**Why this priority**: Auditability is a dependency for governance mutations and must be built into the write path, but it builds on the validated CRUD behavior from Stories 1-3.

**Independent Test**: Perform objective create, update, and delete operations, then verify each accepted mutation produces exactly one corresponding audit event and that rejected mutations produce none.

**Acceptance Scenarios**:

1. **Given** a valid objective creation, **When** the mutation succeeds, **Then** one ObjectiveCreated audit event exists for that organization and objective.
2. **Given** a valid objective update, **When** the mutation succeeds, **Then** one ObjectiveUpdated audit event exists for that organization and objective.
3. **Given** a valid objective deletion, **When** the mutation succeeds, **Then** one ObjectiveDeleted audit event exists for that organization and objective.
4. **Given** a rejected objective mutation, **When** validation fails, **Then** no objective data changes and no audit event is recorded.

### Edge Cases

- What happens when a referenced team, project, user, or parent objective does not exist? The request is rejected with a clear not-found or invalid-reference error and no objective changes.
- What happens when an objective is created without team, project, or user scope? It remains organization-scoped and is retrievable by id; it is not included in team-, project-, or user-specific active lists unless a later feature defines organization-level resolution.
- What happens when multiple scope references are provided? Each provided reference is validated against the caller organization, and the objective may appear in every matching active scope list, preserving the permissive current Python service behavior.
- What happens when a list operation targets a scope with no active objectives? An empty list is returned, not an error.
- What happens when a parent objective has inactive or deleted children? Active lists include only active objectives for the requested scope; inactive/deleted records do not appear merely because of their tree position.
- What happens when two concurrent parent updates could jointly create a cycle? At most one succeeds; any operation that would observe or create a cycle is rejected and no cyclic chain is ever committed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide organization-scoped objective records with stable identifiers, optional team/project/user scope references, title, optional description, optional parent objective reference, inheritance marker, status, and creation timestamp.
- **FR-002**: System MUST allow creating an objective under a caller organization with a required title, optional description, optional team/project/user references, and optional parent objective reference.
- **FR-003**: Created objectives MUST default to active status and not-inherited presentation unless an operation explicitly returns them as inherited.
- **FR-004**: System MUST allow retrieving an objective by id only within the caller organization.
- **FR-005**: System MUST allow updating an objective's title, description, and status without changing its organization or scope references unless a scoped parent update is explicitly requested.
- **FR-006**: System MUST allow deleting an existing objective by id as a hard delete, matching current Python CRUD behavior.
- **FR-007**: System MUST allow listing active objectives for a team, user, or project, ordered by creation time ascending, matching current Python service behavior.
- **FR-008**: System MUST validate every provided team, project, and user scope reference against the caller organization before creating or updating an objective.
- **FR-009**: System MUST validate every provided parent objective reference against the caller organization before creating or updating an objective.
- **FR-010**: System MUST reject any objective create or update that would make an objective directly or indirectly its own ancestor.
- **FR-011**: System MUST perform all accepted objective create, update, and delete mutations through the shared audit write path, emitting ObjectiveCreated, ObjectiveUpdated, and ObjectiveDeleted audit events with the organization id, objective id, and actor.
- **FR-012**: System MUST update Governance's published event contract to include ObjectiveDeleted as part of this feature, so consumers and audit tests do not depend on an undocumented event.
- **FR-013**: System MUST reject invalid create, update, or delete operations atomically: no objective state changes and no audit event is recorded when validation fails.
- **FR-014**: System MUST preserve the current Python service's permissive scoping behavior unless explicitly superseded above: an objective may be organization-only or may carry one or more of team, project, and user scope references.
- **FR-015**: System MUST NOT implement effective objective resolution in this feature beyond active scoped list operations; full inherited/local resolution remains owned by `003-hierarchical-resolution-engine`.
- **FR-016**: System MUST NOT implement route-level permission policy in this feature; consuming routes/tools are responsible for deciding which already-authenticated callers may invoke the objective application operations.

### Key Entities

- **Objective**: A governance goal owned by one organization. Attributes: id, organization reference, optional team/project/user scope references, title, optional description, optional parent objective reference, inheritance marker, status, and created-at timestamp. It may be organization-only or attached to one or more narrower scopes.
- **Objective Tree**: Parent/child relationships between objectives within the same organization. A tree is valid only if following parent references always terminates without revisiting the same objective.
- **Audit Event**: A record written for accepted Objective mutations. Objective creation maps to ObjectiveCreated, update maps to ObjectiveUpdated, and hard deletion maps to ObjectiveDeleted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For equivalent create, retrieve, update, delete, and active-list fixtures, the new Objective behavior matches the current Python service for all non-superseded cases, with the clarified ObjectiveDeleted audit event added for deletion.
- **SC-002**: 100% of create and update attempts referencing a team, project, user, or parent objective outside the caller organization are rejected with zero persisted objective changes.
- **SC-003**: 100% of direct and indirect parent-objective cycle attempts are rejected, including concurrent parent updates that would jointly create a cycle.
- **SC-004**: Every accepted objective create, update, and delete produces exactly one corresponding audit event, and every rejected mutation produces zero audit events.
- **SC-005**: Active list operations for team, project, and user scopes return only active objectives for the requested scope, in creation order, with zero objectives from another organization.

## Assumptions

- This feature builds the Governance bounded-context objective model and application-layer CRUD/list operations only; REST route shape and UI are owned by later Distribution and Governance UI features.
- The caller's organization id and actor id are available to the application service from the consuming route/tool layer.
- Identity Access provides organization ownership checks for referenced teams and users; project organization ownership is available through the Prompt Registry project contract or its equivalent validated handoff.
- Audit write-path infrastructure from `backlog/003-audit-compliance/001-audit-event-schema-and-write-path.md` exists before this feature's mutations are wired.
- The `is_inherited` value is stored for compatibility with the legacy response shape but is treated as presentation state by resolution operations; newly created local objectives default to not inherited.
- Objective status remains a string-compatible lifecycle value for this port, preserving the current Python behavior where active lists include only status `active` and updates may set status.
