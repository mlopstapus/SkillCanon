# Feature Specification: Workflow Model & CRUD

**Feature Branch**: `023-workflow-model-crud`

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "Port the Workflow model & CRUD from the legacy Python implementation, scoped under Organization, per backlog/007-workflow-orchestration/001-workflow-model-and-crud.md and backlog/007-workflow-orchestration/EPIC.md. New `workflow.workflows` table: id, organization_id, user_id, project_id (nullable), name, description, steps (jsonb), timestamps. Invariant: project_id, if set, must belong to the same organization_id as the workflow. CRUD operations: create, update, list workflows (filterable by user/project/org). `steps` structure references prompt names (not IDs), matching current Python behavior — validated for shape only, not resolved against Prompt Registry until run time. Acceptance criteria: creating a workflow scoped to a project from a different organization is rejected; every mutation (create/update) produces a corresponding audit event. Reference implementation: legacy/backend/src/spechub_server/services/workflow_service.py (create_workflow, list_workflows, get_workflow, update_workflow only — delete_workflow, run_workflow, and share_workflow/unshare_workflow belong to other backlog items)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a workflow (Priority: P1)

A user defines a new workflow within their organization — a named, ordered chain of prompt-expansion steps — optionally scoping it to one of the organization's projects, so it exists as a reusable, editable definition that can later be run.

**Why this priority**: Nothing else in this feature (or in the broader Workflow Orchestration epic) has anything to act on until a workflow can be created and durably stored. This is the foundational capability.

**Independent Test**: Can be fully tested by creating a workflow with a name and a small ordered list of steps, and confirming it is retrievable afterward with the fields as submitted.

**Acceptance Scenarios**:

1. **Given** an authenticated user in an organization, **When** they create a workflow with a name and an ordered list of steps, **Then** the workflow is stored scoped to their organization and to them as its owner, and a corresponding audit event is recorded.
2. **Given** an authenticated user and a project that belongs to their own organization, **When** they create a workflow scoped to that project, **Then** the workflow is stored with that project association and a corresponding audit event is recorded.
3. **Given** an authenticated user and a project that belongs to a *different* organization than the user's own, **When** they attempt to create a workflow scoped to that project, **Then** the attempt is rejected, no workflow record is created, and no audit event is recorded.
4. **Given** a workflow definition whose steps reference a prompt name that does not currently exist anywhere in the Prompt Registry, **When** the workflow is created, **Then** creation still succeeds — the prompt name is stored as given and is not looked up or validated for existence at creation time.
5. **Given** a workflow definition with no steps at all, **When** it is created, **Then** creation succeeds with an empty ordered step list (a workflow may be authored incrementally).
6. **Given** a workflow definition whose steps list contains a malformed step (for example, missing its required identifying name, or a field of the wrong type), **When** creation is attempted, **Then** the attempt is rejected, no workflow record is created, and no audit event is recorded.

---

### User Story 2 - Browse workflows (Priority: P1)

A user retrieves the set of workflows relevant to them — their own, or those scoped to a particular project, or all of an organization's workflows — so they can find one to inspect, edit, or (in a later capability) run.

**Why this priority**: A workflow that can be created but never found again delivers no value; listing is the primary way users and the rest of the system discover what workflows exist. Equal priority to creation because the two are inseparable halves of the same minimum useful capability.

**Independent Test**: Can be fully tested by creating several workflows with different owners and project scopes, then confirming each filtered listing (by user, by project, by organization) returns exactly the expected set.

**Acceptance Scenarios**:

1. **Given** an organization with workflows owned by several different users, **When** workflows are listed filtered to one specific user, **Then** only that user's own workflows are returned.
2. **Given** an organization with workflows scoped to different projects (and some scoped to no project at all), **When** workflows are listed filtered to one specific project, **Then** only workflows scoped to that project are returned.
3. **Given** an organization with multiple workflows across different owners and projects, **When** workflows are listed for the organization with no further filter, **Then** every workflow belonging to that organization is returned, and none belonging to any other organization.
4. **Given** an organization with no workflows yet, **When** workflows are listed for it, **Then** an empty list is returned rather than an error.
5. **Given** workflows created at different times, **When** a listing is retrieved, **Then** results are ordered with the most recently updated workflow first.

---

### User Story 3 - Edit a workflow's definition (Priority: P2)

The owner of an existing workflow revises its name, description, or ordered steps as their process evolves, without needing to recreate the workflow from scratch.

**Why this priority**: Important for a workflow to stay useful over time, but strictly dependent on User Story 1 (a workflow must exist before it can be edited) and delivers less immediate value than being able to create and find workflows at all.

**Independent Test**: Can be fully tested by creating a workflow, updating its name, description, and steps, and confirming the retrieved workflow reflects the new values while its identity, organization, owner, and project scope are unchanged.

**Acceptance Scenarios**:

1. **Given** an existing workflow, **When** its owner updates its name and description, **Then** the stored workflow reflects the new values, its last-updated time advances, and a corresponding audit event is recorded.
2. **Given** an existing workflow, **When** its owner replaces its ordered step list with a new one, **Then** the stored workflow reflects the new steps and a corresponding audit event is recorded.
3. **Given** an existing workflow, **When** its owner submits an update containing a malformed step (missing required fields or wrong field types), **Then** the update is rejected, the stored workflow is left unchanged, and no audit event is recorded.
4. **Given** an existing workflow, **When** a user who is not its owner attempts to update it, **Then** the attempt is rejected, the stored workflow is left unchanged, and no audit event is recorded.
5. **Given** an existing workflow, **When** an update is submitted that omits a field (name, description, or steps), **Then** that field's previously stored value is left unchanged — only the fields explicitly provided are updated.

---

### Edge Cases

- What happens to a workflow's project scope over time? It is fixed at creation and cannot be changed by an update — moving a workflow to a different project (or removing its project scope) is out of scope for this feature.
- What happens when a workflow's associated project is later deleted or the workflow's owning user is removed from the organization? Out of scope for this feature; no cascading or reassignment behavior is defined here.
- What happens when a workflow's steps reference each other (a later step depending on an earlier one's output) in a way that would be circular? Structural execution ordering and circular-reference detection belong to the workflow *running* capability (a separate, not-yet-built feature) and are not validated at creation or edit time here — this feature only validates that each individual step is well-formed.
- What happens when two steps in the same workflow share the same step identifier? Rejected as a malformed step list — step identifiers must be unique within a single workflow, since later capabilities (running, threading outputs between steps) depend on that uniqueness to unambiguously address a step.
- Can a workflow be deleted? Not by this feature — deletion is not part of this feature's requirements and is left for separate, future work.
- Can a workflow be shared with other users? Not by this feature — sharing is out of scope here and belongs to a separate backlog item.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authenticated user to create a workflow consisting of a name, an optional description, and an ordered list of steps, scoped to the user's own organization and recorded as owned by that user.
- **FR-002**: System MUST allow a workflow to optionally be scoped to one project at creation time.
- **FR-003**: System MUST reject creating a workflow scoped to a project that does not belong to the same organization as the workflow, without creating any record or audit event.
- **FR-004**: System MUST validate that every step in a workflow's step list is well-formed — carrying a step identifier, a referenced prompt name, and an ordering/dependency relationship to other steps in the same list — and MUST reject a create or update whose step list contains a malformed step, with no record change and no audit event.
- **FR-005**: System MUST reject a step list containing two or more steps that share the same step identifier.
- **FR-006**: System MUST NOT verify, at creation or edit time, that a step's referenced prompt name actually exists in the Prompt Registry — that resolution happens only when a workflow is later run.
- **FR-007**: System MUST NOT validate, at creation or edit time, that step dependency references are free of cycles or point at real step identifiers — that validation belongs to the workflow-running capability, not this feature.
- **FR-008**: System MUST allow a workflow to be created with an empty step list.
- **FR-009**: System MUST allow retrieving workflows filtered by owning user, by project, or by organization, returning only workflows that match the given filter and belong to the caller's own organization.
- **FR-010**: System MUST return an empty result, not an error, when a filtered listing matches no workflows.
- **FR-011**: System MUST order listed workflows by most-recently-updated first.
- **FR-012**: System MUST allow a workflow's owner to update its name, description, and/or step list, leaving any field not included in the update unchanged.
- **FR-013**: System MUST NOT allow a workflow's organization, owning user, or project scope to be changed by an update.
- **FR-014**: System MUST reject an update attempted by any user other than the workflow's owner, with no record change and no audit event.
- **FR-015**: System MUST record a corresponding audit event for every successful workflow creation and every successful workflow update, and MUST NOT record an audit event for any rejected create or update attempt.
- **FR-016**: System MUST NOT expose a delete operation as part of this feature's scope.

### Key Entities

- **Workflow**: A named, ordered chain of prompt-expansion steps belonging to exactly one organization, owned by exactly one user, and optionally scoped to one project within that same organization. Key attributes: name, optional description, ordered step list, creation and last-updated times. A workflow's organization, owner, and project scope are fixed at creation.
- **Workflow Step**: An entry within a workflow's ordered step list. Key attributes: a step identifier unique within its workflow, a referenced prompt name (not a Prompt Registry identifier — resolved by name only, and only at run time), an optional specific prompt version, and its ordering/dependency relationship to other steps in the same workflow. Not independently addressable outside its parent workflow.
- **Audit Event**: A durable record for every successful create and update mutation on a workflow, written through the existing audit write path.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of attempts to create a workflow scoped to a project outside the creator's own organization are rejected, with zero workflow records created.
- **SC-002**: 100% of attempts to create or update a workflow with a malformed step (missing required fields, wrong field types, or a duplicate step identifier within the same list) are rejected, with the workflow's stored state left unchanged.
- **SC-003**: 100% of successful workflow creations and updates produce exactly one corresponding audit event, and 100% of rejected attempts produce zero.
- **SC-004**: A filtered workflow listing (by user, by project, or by organization) returns 100% of matching workflows and 0% of non-matching ones, verified across the acceptance suite.
- **SC-005**: 100% of attempts by a non-owner to update a workflow are rejected, with the workflow's stored state left unchanged.
- **SC-006**: A workflow referencing a not-yet-existing prompt name can always be created successfully — 0% of such creations are rejected on that basis.

## Assumptions

- "Authenticated user" / "caller" means an already-authenticated actor already resolved to an organization, user, and role by Identity & Access; authentication and role resolution themselves are out of scope for this feature.
- Authorization for updating a workflow defaults to "the workflow's own owning user" only — no organization-administrator override is included in this feature, matching the source Python implementation, which performs no ownership or role check at all in `update_workflow`. A broader authorization model (e.g. admin override, or the sharing behavior in `backlog/007-workflow-orchestration/004-workflow-sharing.md`) can be layered on by a later feature without changing this one's data model.
- `delete_workflow` and `run_workflow` exist in the legacy Python service but are explicitly out of scope for this feature — deletion is not part of this feature's requirements (per the source backlog item `backlog/007-workflow-orchestration/001-workflow-model-and-crud.md`, which lists only create/update/list), and running belongs to `backlog/007-workflow-orchestration/002-workflow-runner.md`. `share_workflow`/`unshare_workflow` belong to `backlog/007-workflow-orchestration/004-workflow-sharing.md`.
- A workflow step's "referenced prompt name" is matched by name only, never by a Prompt Registry identifier, matching the source Python implementation's lazy-lookup behavior described in `src/bcs/workflow-orchestration/CONTRACT.md`.
- The organization boundary check for a project-scoped workflow (FR-003) depends on being able to resolve which organization a given project belongs to; this feature assumes that lookup is available from the existing project data already owned elsewhere in the system.
- Audit events are written through the existing audit write path; defining that event schema and storage is out of scope for this feature.
- "Most recently updated first" ordering (FR-011) is a reasonable default for a browsing list, matching the source Python implementation's existing `updated_at desc` ordering; no alternative sort was requested.
- A step's ordering/dependency relationship to other steps (FR-004) is stored as submitted; this feature validates only that each step is individually well-formed, not that the dependency graph as a whole is coherent (see Edge Cases and FR-007).
