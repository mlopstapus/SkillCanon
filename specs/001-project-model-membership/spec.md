# Feature Specification: Project Model & Membership

**Feature Branch**: `001-project-model-membership`

**Created**: 2026-07-26

**Status**: Clarified

**Input**: User description: "Project Model & Membership (Epic 006: Prompt Registry). Port `Project` and `ProjectMember` from the current Python `models.py`/`project_service.py` into the Prompt Registry bounded context. Projects are team-owned workspaces scoped under `Organization`; members may come from other teams in the same organization, but never from another organization. Provide `prompt_registry.projects` and `prompt_registry.project_members`, enforce same-organization invariants, expose project create/update/list and member add/remove behavior, and audit every mutation."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create an organization-scoped project (Priority: P1)

An authorized caller creates a project for a team in an organization, optionally naming a lead user from that same organization. The resulting project becomes available to Prompt Registry consumers and to other bounded contexts through the Prompt Registry read contract.

**Why this priority**: Project creation is the foundation for every downstream Prompt Registry feature that needs project-scoped prompts, governance resolution, repository links, or project membership.

**Independent Test**: Create a project for an existing organization/team pair and confirm the project can be read back with the expected organization, team, lead, name, slug, description, timestamps, and audit event.

**Acceptance Scenarios**:

1. **Given** organization A has team T and user U in organization A, **When** a caller creates a project for team T with user U as lead, **Then** the project is created under organization A, references team T and lead U, and records a `project.created` audit event.
2. **Given** organization A has team T and no lead is supplied, **When** a caller creates a project for team T, **Then** the project is created with no lead user and records a `project.created` audit event.
3. **Given** organization A receives a create request naming a team from organization B, **When** the request is processed, **Then** the request is rejected and no project or audit event is created.
4. **Given** organization A receives a create request naming a lead user from organization B, **When** the request is processed, **Then** the request is rejected and no project or audit event is created.

---

### User Story 2 - Manage project membership across teams in one organization (Priority: P2)

An authorized caller adds users from any team in the same organization to a project, lists the current membership, and removes members when access is no longer needed.

**Why this priority**: Cross-team membership is the main reason Project is a separate Prompt Registry concept rather than just a Team alias; it must work without permitting cross-organization access.

**Independent Test**: Add users from the owning team and from a different same-organization team, list members, remove one member, and verify membership state and audit events are correct after each mutation.

**Acceptance Scenarios**:

1. **Given** a project in organization A and a user in a different team within organization A, **When** the user is added as a project member, **Then** membership is created and a `project_member.created` audit event is recorded.
2. **Given** a project in organization A and a user in organization B, **When** the user is added as a project member, **Then** the request is rejected and no membership or audit event is created.
3. **Given** a user is already a member of a project, **When** the same user is added to the same project again, **Then** the request is rejected by the project/user uniqueness rule and no duplicate membership is created.
4. **Given** a project with members, **When** members are listed, **Then** only that project's memberships are returned, ordered by membership creation time.
5. **Given** a project member exists, **When** that member is removed from the project, **Then** the membership is removed and a `project_member.deleted` audit event is recorded.

---

### User Story 3 - Read and update projects within organization boundaries (Priority: P3)

An authorized caller reads a project, updates its editable metadata, and lists projects by organization or by team without seeing projects from another organization.

**Why this priority**: Project records must be discoverable and maintainable after creation, but these read/update flows build on the core project and membership invariants from User Stories 1 and 2.

**Independent Test**: Create multiple projects across two organizations and teams, then verify get, update, list-by-organization, and list-by-team return and mutate only the allowed project set.

**Acceptance Scenarios**:

1. **Given** a project belongs to organization A, **When** a caller in organization A reads it by id, **Then** the project metadata is returned.
2. **Given** a project belongs to organization B, **When** a caller in organization A attempts to read or update it, **Then** the project is treated as inaccessible as if it did not exist.
3. **Given** a project in organization A, **When** the caller updates its name, description, or lead user, **Then** the saved project reflects the change and a `project.updated` audit event is recorded.
4. **Given** a project in organization A, **When** the caller attempts to update the lead user to a user from organization B, **Then** the update is rejected and no project or audit event changes.
5. **Given** projects exist across multiple organizations and teams, **When** projects are listed for organization A, **Then** only organization A's projects are returned in name order.
6. **Given** projects exist across multiple teams in organization A, **When** projects are listed for one team, **Then** only that team's projects are returned in name order.

---

### User Story 4 - Delete a project when it is no longer needed (Priority: P4)

An authorized caller removes a project that should no longer be used, matching the legacy project service's delete behavior.

**Why this priority**: Deletion is part of the legacy CRUD surface, but it is lower priority than creating, maintaining, and listing active project data.

**Independent Test**: Create a project, delete it, confirm it can no longer be read or listed, confirm associated project memberships no longer remain usable, and confirm one audit event was recorded.

**Acceptance Scenarios**:

1. **Given** a project exists in organization A, **When** a caller in organization A deletes it, **Then** the project is removed from reads/lists and a `project.deleted` audit event is recorded.
2. **Given** a project belongs to organization B, **When** a caller in organization A attempts to delete it, **Then** the operation is rejected as if the project did not exist and no audit event is created.
3. **Given** a project has members, **When** the project is deleted, **Then** no remaining membership grants for that project are returned by member listing.

### Edge Cases

- What happens when the owning team id does not exist? The create request is rejected and no project or audit event is created.
- What happens when a lead user id does not exist? The create or update request is rejected and no project or audit event changes.
- What happens when the same project slug is requested twice in one organization? The second request is rejected by a data-layer uniqueness rule.
- What happens when the same project name is requested twice in one organization? The second request is rejected, preserving the Prompt Registry contract that project names are unique within an organization.
- What happens when the same slug or name is used in two different organizations? Both projects may exist; project names and slugs are organization-scoped, not global.
- What happens when a member removal is requested for a user who is not currently a member? The operation returns a clear not-found/no-membership result and writes no audit event.
- What happens when callers try to move a project to a different team or organization through update? Reassignment is out of scope; update only changes editable metadata and lead user.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `prompt_registry.projects` table with `id`, `organization_id`, `team_id`, nullable `lead_user_id`, `name`, `slug`, nullable `description`, `created_at`, and `updated_at`.
- **FR-002**: System MUST provide a `prompt_registry.project_members` table with `id`, `project_id`, `user_id`, `role`, and `created_at`.
- **FR-003**: System MUST enforce uniqueness of project membership by `(project_id, user_id)` at the data layer.
- **FR-004**: System MUST enforce project name uniqueness within an organization.
- **FR-005**: System MUST enforce project slug uniqueness within an organization.
- **FR-006**: System MUST create a project only when the supplied `organization_id` exists and the supplied `team_id` belongs to that same organization.
- **FR-007**: System MUST allow `lead_user_id` to be absent.
- **FR-008**: When `lead_user_id` is present on create or update, system MUST verify that the user belongs to the project's organization.
- **FR-009**: System MUST allow creating a project with name, slug, optional description, owning team, and optional lead user.
- **FR-010**: System MUST allow reading a single project by organization and project id, returning no project for nonexistent or cross-organization ids.
- **FR-011**: System MUST allow updating a project's name, description, and lead user, without changing its organization or owning team.
- **FR-012**: System MUST allow deleting a project within its organization and MUST ensure deleted projects and their memberships are no longer returned by project/member reads.
- **FR-013**: System MUST allow listing projects by organization.
- **FR-014**: System MUST allow listing projects by team within an organization.
- **FR-015**: Project list results MUST be ordered by project name.
- **FR-016**: System MUST allow adding a project member only when both the project and user belong to the same organization; the member may belong to any team in that organization.
- **FR-017**: System MUST reject adding the same user to the same project more than once.
- **FR-018**: System MUST allow listing a project's members, ordered by membership creation time.
- **FR-019**: System MUST allow removing a project member by project and user.
- **FR-020**: System MUST record exactly one audit event in the same transaction for every successful project create, project update, project delete, member add, and member remove operation.
- **FR-021**: System MUST NOT record an audit event for any failed or rejected mutation.
- **FR-022**: Prompt Registry MUST verify organization, team, and user membership through the Identity & Access public read contract, not by reading Identity & Access internal tables directly.
- **FR-023**: Prompt Registry MUST expose project metadata to other bounded contexts through its public read contract, including the project id, organization id, owning team id, and project name.
- **FR-024**: This feature MUST NOT implement project authorization policy, UI workflows, prompt CRUD, prompt versioning, prompt sharing, or prompt expansion.

### Key Entities

- **Project**: A team-owned Prompt Registry workspace inside exactly one organization. Key attributes: stable identifier, organization, owning team, optional lead user, display name, slug, optional description, creation timestamp, and update timestamp. Project names and slugs are unique within an organization.
- **Project Member**: A user's membership grant on exactly one project. Key attributes: stable identifier, project, user, role label, and creation timestamp. A user may be a member of many projects, but only once per project.
- **Identity References**: Organization, team, and user ids supplied by Identity & Access. Prompt Registry treats these as external ids validated through public read contracts; it does not own their lifecycle.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of attempts to create or update a project with a team or lead user outside the project's organization are rejected, with zero project or audit rows written for rejected mutations.
- **SC-002**: 100% of attempts to add a project member from a different organization are rejected, with zero membership or audit rows written for rejected mutations.
- **SC-003**: 100% of duplicate `(project_id, user_id)` member additions are rejected by a persisted uniqueness rule, including concurrent duplicate attempts.
- **SC-004**: Project list-by-organization and list-by-team return exactly the matching projects in name order and return zero projects from other organizations across the automated acceptance suite.
- **SC-005**: Every successful project or project-member mutation covered by this feature writes exactly one audit event in the same transaction, and every forced failure writes zero audit events.
- **SC-006**: Characterization tests against the legacy project service behavior pass for create, read, update, delete, list projects, add member, list members, and remove member, except for explicitly documented multi-organization corrections.

## Assumptions

- "Caller" means an already-authenticated, already-authorized actor. Authorization rules for who may create projects, update projects, or manage membership are owned by Distribution and/or a later access-control feature, not this data-model feature.
- The issue explicitly requires an `organization_id` on `prompt_registry.projects`; unlike the legacy single-tenant Python model, all project operations are organization-scoped from day one.
- Cross-team membership within the same organization is intentional and must remain valid; only cross-organization membership is invalid.
- The legacy service includes single-project read, member listing, and project deletion in addition to the operations named in the issue. Because the issue says to port `project_service.py` and asks for CRUD, those operations are included here.
- Project update does not move a project to another organization or team and does not change the project slug; those are separate lifecycle decisions outside this feature.
- Project member `role` is stored and returned as a role label with a default of `member`, matching the legacy model. Defining a closed role taxonomy or permission behavior for these labels is out of scope unless a later feature requires it.
- Audit events are written through the Audit & Compliance read/write contract's synchronous transactional write path; Prompt Registry does not publish asynchronous events for Audit to consume.
