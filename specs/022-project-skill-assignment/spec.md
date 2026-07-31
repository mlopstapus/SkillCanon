# Feature Specification: Project Skill Assignment

**Feature Branch**: `022-project-skill-assignment`

**Created**: 2026-07-30

**Status**: Clarified

**Input**: User description: "Project Skill Assignment (Epic 006: Prompt Registry, backlog item `backlog/006-prompt-registry/007-project-skill-assignment.md`, depends on `001-project-model-and-membership.md` and `003-prompt-sharing.md`). New capability with no legacy Python precedent, introduced by PDR-016: a project picks which skills from its participating teams' catalogs apply to it, marking each assignment `required` or `optional`. This is a plain Prompt Registry catalog fact, not a Governance policy — it replaces the originally-speced `Policy.enforcementType: \"require-skill\"` / `resolveRequiredSkillPolicies` design now that skill ownership is independent of any project. Required capabilities: `assignSkillToProject`, `unassignSkillFromProject`, `listRequiredSkillsForProject` (a flat, direct read with no team-chain resolution — this is what VCS Integration's PR check reads), and extending the existing accessible-skills query (`listPrompts`) so that, given a project, it also includes every skill assigned to that project regardless of which participating team contributed it."

## Clarifications

### Session 2026-07-30

- Q: This feature's own acceptance criteria (rejecting assignment from a non-participating team, and members' cross-team access) require collaborator-team participation for a project — a capability speced in `backlog/006-prompt-registry/001-project-model-and-membership.md` (`project_teams`: an owner team plus any number of collaborator teams) but not yet built (confirmed by grepping `src/bcs/prompt-registry/infrastructure/schema.ts`: only a project's single owner `team_id` exists today). How should this feature handle that gap? → A: This feature implements `project_teams` (the table, add/remove collaborator team, and both `001`'s invariants — cross-org rejection and "owner team can't also be a collaborator") itself, pulling that piece of `001` forward, since `022`'s own acceptance criteria are untestable without it. This matches this repository's established precedent for one feature completing part of a not-yet-built dependency when it has a real, immediate need (e.g. `008-jwt-session-auth` pulling forward part of `003-audit-compliance`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Establish a project's participating teams (Priority: P1)

A project's owner-team administrator adds another team as a collaborator on the project, and removes one when it no longer participates, so that "which teams' catalogs this project can draw skills from" is an explicit, queryable fact.

**Why this priority**: Every other story in this feature depends on a project having a well-defined set of participating teams (its owner team plus any collaborators) to check assignment eligibility and member access against — without this, "assign a skill from a participating team's catalog" has nothing to validate against. Pulled forward into this feature from `backlog/006-prompt-registry/001-project-model-and-membership.md` (see Clarifications) because it was not yet built and this feature's own acceptance criteria cannot be met without it.

**Independent Test**: Can be fully tested by creating a project and a second, same-organization team, adding that team as a collaborator, confirming it appears in the project's participating-teams list, removing it, and confirming it no longer appears.

**Acceptance Scenarios**:

1. **Given** a project and a same-organization team that is not already participating in it, **When** the project's owner-team administrator adds that team as a collaborator, **Then** a collaborator-team record is created and the team appears in the project's participating-teams list.
2. **Given** a team from a different organization than the project, **When** an attempt is made to add it as a collaborator, **Then** the attempt is rejected and no record is created.
3. **Given** a project's own owner team, **When** an attempt is made to add that same team as a collaborator on its own project, **Then** the attempt is rejected — a team cannot be both the owner and a collaborator on the same project.
4. **Given** a team already a collaborator on a project, **When** the same team is added as a collaborator again, **Then** the second attempt is rejected as a duplicate and no second record is created.
5. **Given** a caller who is not an administrator of the project's owner team, **When** they attempt to add or remove a collaborator team, **Then** the attempt is rejected.
6. **Given** a team that is a collaborator on a project, **When** the project's owner-team administrator removes it, **Then** the collaborator-team record is removed and the team no longer appears in the project's participating-teams list.
7. **Given** a team that participates in a project only as a collaborator (not as the owner), **When** projects are listed for that team, **Then** the project still appears in that team's project list.

---

### User Story 2 - Assign a skill from a participating team's catalog to a project (Priority: P1)

A project administrator picks a skill already in the catalog of the project's owner team or one of its collaborator teams, and assigns it to the project, marking it as either required or optional.

**Why this priority**: Assignment is the foundational act this entire feature exists for — without it, a project has no declared set of skills at all, and nothing downstream (enforcement, member access) has anything to read.

**Independent Test**: Can be fully tested by creating a project with an owner team and a collaborator team, each with its own skill, assigning both skills to the project (one required, one optional), and confirming both assignments are recorded with the correct requirement level.

**Acceptance Scenarios**:

1. **Given** a project whose owner team owns a skill, **When** a project administrator assigns that skill to the project as `required`, **Then** an assignment record is created linking the project to the skill with `requirement: required`, and a `ProjectSkillAssigned` audit event is recorded.
2. **Given** a project with a collaborator team that owns a skill, **When** a project administrator assigns that skill to the project as `optional`, **Then** the assignment is created with `requirement: optional`, and a `ProjectSkillAssigned` audit event is recorded.
3. **Given** a skill owned by a team that is neither the project's owner team nor one of its collaborator teams, **When** an assignment is attempted, **Then** the attempt is rejected, no assignment record is created, and no audit event is recorded.
4. **Given** a skill owned directly by an individual user (a personal skill), **When** an assignment of that skill to any project is attempted — even by a project administrator who is also that skill's owner — **Then** the attempt is rejected, no assignment record is created, and no audit event is recorded.
5. **Given** a skill already assigned to a project, **When** the same skill is assigned to the same project again, **Then** the second attempt is rejected as a duplicate and no second assignment record is created.

---

### User Story 3 - Retrieve the required-skill list for enforcement (Priority: P1)

An external consumer (a repository/pull-request check) retrieves the flat list of skills marked `required` for a project, to determine what a change must satisfy before it can be accepted.

**Why this priority**: This flat, direct read is the entire reason the feature exists from a business standpoint — it is what turns a project's catalog fact into an enforceable gate. Without it, marking a skill "required" has no observable effect anywhere.

**Independent Test**: Can be fully tested by assigning one skill as `required` and another as `optional` to a project, then confirming the retrieved list contains only the required skill's name.

**Acceptance Scenarios**:

1. **Given** a project with one skill assigned `required` and another assigned `optional`, **When** the required-skill list is retrieved for that project, **Then** only the `required` skill's name appears in the result.
2. **Given** a project with no assigned skills, **When** the required-skill list is retrieved, **Then** an empty list is returned.
3. **Given** a project whose required skill was contributed by a collaborator team (not the owner team), **When** the required-skill list is retrieved, **Then** that skill still appears — the list does not distinguish by which participating team contributed the skill.

---

### User Story 4 - Project members access everything assigned to their project (Priority: P2)

A member of a project browses or invokes the project's skill catalog and sees every skill assigned to the project, including skills contributed by a team the member does not personally belong to.

**Why this priority**: This is the access-model guarantee the whole ownership/assignment split depends on (per PDR-016) — a required skill that a project member can't actually reach would defeat the point of marking it required. It is P2 rather than P1 because it depends on assignments already existing (User Story 2) to have anything to demonstrate.

**Independent Test**: Can be fully tested by creating a project with two participating teams, assigning a skill contributed by the collaborator team, adding a member who only belongs to the owner team, and confirming that member's project-scoped catalog view includes the collaborator team's assigned skill.

**Acceptance Scenarios**:

1. **Given** a project member who belongs only to the project's owner team, **When** that member's accessible-skill list is retrieved for the project, **Then** it includes every skill assigned to the project, including those contributed by a collaborator team the member does not belong to.
2. **Given** a skill owned by a collaborator team but never assigned to the project, **When** a project member's project-scoped accessible-skill list is retrieved, **Then** that unassigned skill does not appear in the project-scoped result (even if the member could otherwise see it via their own team membership).
3. **Given** a user who is not a member of the project, **When** they attempt to retrieve the project-scoped accessible-skill list, **Then** the project-assigned skills are not included on that basis alone — only skills reachable through the user's own ownership, team, or subscriptions still appear.

---

### User Story 5 - Remove a skill assignment (Priority: P2)

A project administrator removes a skill's assignment from a project when it no longer applies, whether it was marked required or optional.

**Why this priority**: Assignment is only a safe, low-stakes action if it stays reversible — without removal, correcting a mistaken or outdated assignment would require abandoning the project itself. Lower priority than assigning and reading the required list because those two alone already deliver the feature's core value.

**Independent Test**: Can be fully tested by assigning a skill to a project, confirming it appears in the project's required or accessible list as applicable, unassigning it, and confirming it no longer appears in either.

**Acceptance Scenarios**:

1. **Given** a skill assigned to a project, **When** a project administrator unassigns it, **Then** the assignment record is removed and a `ProjectSkillUnassigned` audit event is recorded.
2. **Given** a skill that was marked `required` and is then unassigned, **When** the required-skill list is retrieved afterward, **Then** that skill no longer appears in it.
3. **Given** no assignment exists between a given project and skill, **When** an unassign is attempted anyway, **Then** the attempt is rejected without side effects and no audit event is recorded.

### Edge Cases

- What happens when a project administrator wants to change an existing assignment from `required` to `optional` (or vice versa)? No direct "update requirement" operation exists — the assignment must be unassigned and re-assigned with the new requirement level.
- What happens when a collaborator team is removed from a project after one of its skills has already been assigned? Out of scope for this feature — the assignment record is not automatically cleaned up when team participation changes; that lifecycle interaction belongs to whichever feature owns collaborator-team removal.
- What happens when the assigned skill itself is later deprecated by its owner? The assignment remains in place and the skill continues to appear in the required/accessible lists; deprecation does not implicitly unassign a skill from any project.
- What happens when a project is deleted while it still has skill assignments? Out of scope for this feature's acceptance criteria — the existing project deletion behavior (removing dependent project data) governs this; no new behavior is introduced here.
- What happens when two callers concurrently attempt to assign the same skill to the same project? Exactly one assignment record is created; the other attempt is rejected by the unique `(project, skill)` constraint.
- What happens when two callers concurrently attempt to add the same team as a collaborator on the same project? Exactly one collaborator-team record is created; the other attempt is rejected by the unique `(project, team)` constraint.
- What happens when a project's owner team itself is queried as part of the project's participating-teams list? It is always included — the owner team's participation comes from `project.teamId`, not from a collaborator-team record, but it counts as "participating" for skill-assignment eligibility purposes the same as any collaborator.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a project skill assignment record type that links exactly one project to exactly one skill, carrying a requirement level of either `required` or `optional` and a creation time.
- **FR-002**: System MUST enforce uniqueness on the combination of project and skill, so the same skill cannot be assigned to the same project more than once concurrently.
- **FR-003**: System MUST allow assigning a skill to a project only when the skill is owned by the project's owner team or by one of the project's collaborator teams.
- **FR-004**: System MUST reject assigning a skill that is owned directly by an individual user (a personal skill) to any project, regardless of the acting user's relationship to that skill or to the project.
- **FR-005**: System MUST reject assigning or unassigning a skill where the project and the skill do not belong to the same organization.
- **FR-006**: System MUST record the requirement level (`required` or `optional`) chosen at the time a skill is assigned to a project.
- **FR-007**: System MUST allow an authorized project administrator to remove (unassign) a previously assigned skill from a project.
- **FR-008**: System MUST reject an unassign attempt for a skill that is not currently assigned to the given project, without side effects.
- **FR-009**: System MUST provide a flat, direct read of the skill names assigned to a project with requirement level `required`, without resolving any invoking user's team-inheritance chain.
- **FR-010**: System MUST exclude assignments marked `optional` from the required-skill list.
- **FR-011**: System MUST return an empty required-skill list for a project with no `required` assignments, rather than an error.
- **FR-012**: System MUST extend the existing accessible-skill query so that, when a project is specified and the caller is a member of that project, the result also includes every skill assigned to that project — regardless of which of the project's participating teams contributed it.
- **FR-013**: System MUST NOT include a project's assigned skills in a caller's accessible-skill results when that caller is not a member of the specified project.
- **FR-014**: System MUST restrict assigning and unassigning skills for a project to an authorized project administrator (an admin of the project's owner team).
- **FR-015**: System MUST record a `ProjectSkillAssigned` audit event for every successful assignment and a `ProjectSkillUnassigned` audit event for every successful unassignment, each including organization, project, skill, and acting user identity (assignment events also include the requirement level).
- **FR-016**: System MUST NOT create an assignment record, an unassignment (removal), or an audit event for any rejected assign/unassign attempt.
- **FR-017**: System MUST leave an assigned skill's requirement level and the assignment record itself unaffected by later changes to the skill's own lifecycle state (for example, the owner deprecating it).
- **FR-018**: System MUST provide a collaborator-team record type that links a project to a team participating in it, other than the project's own owner team, with a creation time. *(Pulled forward from `backlog/006-prompt-registry/001-project-model-and-membership.md` — see Clarifications.)*
- **FR-019**: System MUST enforce uniqueness on the combination of project and collaborator team, so the same team cannot be added as a collaborator on the same project more than once concurrently.
- **FR-020**: System MUST reject adding a project's own owner team as a collaborator on that same project.
- **FR-021**: System MUST reject adding or removing a collaborator team where the team does not belong to the same organization as the project.
- **FR-022**: System MUST allow an authorized project administrator (an admin of the project's owner team) to add or remove a collaborator team, and MUST reject the attempt from any other caller.
- **FR-023**: System MUST reject removal of a team that is not currently a collaborator on the given project, without side effects.
- **FR-024**: System MUST treat a project's set of participating teams as its owner team plus its current collaborator teams for skill-assignment eligibility (FR-003), and MUST include a project in a team's project list whenever that team is either the owner or a collaborator.
- **FR-025**: System MUST record an audit event for every successful collaborator-team addition and removal, each including organization, project, team, and acting user identity, and MUST NOT create a collaborator-team record or audit event for any rejected add/remove attempt.

### Key Entities

- **Collaborator Team**: A record marking a team as participating in a project without owning it. Key attributes: project, team, creation time. Uniqueness is enforced on the combination of project and team; a project's owner team is never itself a collaborator-team row — its participation comes from the project's own owner-team reference. *(Pulled forward from `backlog/006-prompt-registry/001-project-model-and-membership.md`.)*
- **Participating Teams**: A read-model concept, not a separately stored entity — for a given project, its owner team plus its current collaborator teams. This is the eligibility set skill assignment checks against.
- **Project Skill Assignment**: A catalog fact linking exactly one project to exactly one skill already present in a participating team's catalog. Key attributes: project, skill, requirement level (`required` or `optional`), creation time. Uniqueness is enforced on the combination of project and skill. Not a Governance policy and not resolved through any team-inheritance chain — a direct, project-scoped fact.
- **Required Skill List**: A read-model concept, not a separately stored entity — for a given project, the flat set of skill names from that project's assignments with requirement level `required`.
- **Project-Scoped Accessible Skill Set**: An extension of the existing accessible-skill concept — for a project member, the union of their ordinary accessible skills and every skill assigned to that specific project, independent of which participating team contributed the assignment.
- **Audit Event**: A durable record for every successful assign and unassign mutation, written through the existing audit write path.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of assignment attempts for a skill owned by a team that is neither the project's owner nor a collaborator are rejected, with zero assignment or audit rows created.
- **SC-002**: 100% of assignment attempts for a personally-owned skill are rejected, with zero assignment or audit rows created, regardless of the acting user's relationship to the project or the skill.
- **SC-003**: 100% of duplicate assignment attempts on an already-assigned (project, skill) pair are rejected, including concurrent duplicate attempts, with no second record ever created.
- **SC-004**: A project's required-skill list contains 100% of its `required` assignments and 0% of its `optional` assignments, verified across the acceptance suite.
- **SC-005**: 100% of project members can retrieve every skill assigned to their project through the project-scoped catalog query, regardless of which participating team contributed each skill.
- **SC-006**: 100% of successful assign and unassign operations produce exactly one corresponding audit event, and 100% of rejected attempts produce zero.
- **SC-007**: 100% of attempts to add a collaborator team from a different organization, or to add a project's own owner team as its collaborator, are rejected, with zero collaborator-team or audit rows created.
- **SC-008**: 100% of duplicate collaborator-team-addition attempts on an already-participating (project, team) pair are rejected, including concurrent duplicate attempts, with no second record ever created.
- **SC-009**: A team's project list includes 100% of projects where that team is the owner or a collaborator, verified across the acceptance suite.

## Assumptions

- "Caller"/"project administrator" means an already-authenticated actor already resolved to an organization, user, and role by Identity & Access; authentication and role resolution themselves are out of scope for this feature.
- Authorization for assigning and unassigning skills defaults to "an admin of the project's owner team," matching the authorization model already established for the project's other owner-team-only administrative actions (managing collaborator teams). This is a reasonable default, not something the source backlog item specified explicitly; it should be confirmed during planning.
- There is no operation to change an existing assignment's requirement level in place — changing `required` to `optional` (or back) is done by unassigning and re-assigning, matching the source backlog item's requirements (which list only assign, unassign, and list, no update).
- This feature implements collaborator-team participation for a project (an owner team plus any number of collaborator teams) as part of its own scope — see Clarifications. That capability was originally speced under `backlog/006-prompt-registry/001-project-model-and-membership.md`, which remains the system of record for its requirements language (User Story 1 and FR-018 through FR-025 here mirror it), but had not been built as of this spec's writing. `001`'s own backlog file should be updated to reflect what this feature delivers on its behalf once planning/implementation completes, rather than left describing already-done work as open.
- This feature does **not** implement the remaining, non-collaborator-team parts of `001` that are unrelated to skill-assignment eligibility — for example, any project-metadata fields or member-management behavior beyond what already exists. Only the owner/collaborator participating-teams concept is pulled forward.
- This feature also depends on a skill already being present in an owner or collaborator team's catalog — either directly owned by that team, or shared into it via subscribe/fork (`backlog/006-prompt-registry/003-prompt-sharing.md`) — which is already implemented.
- Skill deletion, project deletion, and collaborator-team removal are each owned by their own respective features; this feature does not define what happens to an assignment record when any of those occur beyond what is already stated in Edge Cases.
- Audit events are written through the existing Audit & Compliance write path; defining that event schema and storage is out of scope for this feature.
- The requirement level is a closed, two-value enumeration (`required` | `optional`); no additional levels (e.g., a severity gradient) are in scope.
