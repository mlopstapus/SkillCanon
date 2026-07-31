# Tasks: Project Skill Assignment

**Feature**: 022-project-skill-assignment
**Branch**: `022-project-skill-assignment`
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md) | **Data Model**: [data-model.md](./data-model.md)

---

## Phase 1: Setup

- [ ] T001 Verify project environment (Node.js, pnpm, TypeScript, Vitest, Drizzle all configured — existing project, same as `020-prompt-sharing`)

---

## Phase 2: Foundational

- [ ] T002 Add `assigned` (violet), `unassigned` (red), `added` (green), `removed` (red) verbs and color entries to `AUDIT_ACTION_VERBS`/`AUDIT_ACTION_VERB_COLORS` in `src/bcs/audit-compliance/domain/audit-event.ts` (research.md §6)
- [ ] T003 Extend `src/bcs/prompt-registry/infrastructure/schema.ts` with the `projectTeams` and `projectSkillAssignments` Drizzle table definitions per `data-model.md` (both FK to `projects.id` with `onDelete: cascade`; `projectSkillAssignments.skillId` also FK to `prompts.id` with `onDelete: cascade`; unique on `(project_id, team_id)` and `(project_id, skill_id)` respectively)
- [ ] T004 [P] Create `src/bcs/prompt-registry/domain/project-team.ts` — `ProjectTeam` type, `AddCollaboratorTeamParams` (`{ teamId: string }`), error classes: `DuplicateCollaboratorTeamError`, `CollaboratorTeamNotFoundError`, `OwnerTeamCannotBeCollaboratorError` (FR-020), `ProjectTeamOrgMismatchError` (FR-021)
- [ ] T005 [P] Create `src/bcs/prompt-registry/domain/project-skill-assignment.ts` — `ProjectSkillAssignment` type, `AssignSkillToProjectParams` (`{ requirement: "required" | "optional" }`), error classes: `DuplicateProjectSkillAssignmentError`, `ProjectSkillAssignmentNotFoundError`, `SkillNotEligibleForProjectError` (FR-003), `PersonalSkillNotAssignableError` (FR-004). A nonexistent/cross-org skill id reuses `SourceSkillNotFoundError` from `domain/subscription.ts` (same BC, same semantics) rather than a new error class; a nonexistent/cross-org project id reuses `ProjectNotFoundError` from `domain/project.ts` — no new "not found" error classes needed here (found during `/speckit-analyze`, findings U1/U2)
- [ ] T006 Create `src/bcs/prompt-registry/infrastructure/project-teams-repo.ts` with raw queries: `insert`, `findByProjectAndTeam`, `listByProject`, `deleteByProjectAndTeam`
- [ ] T007 Create `src/bcs/prompt-registry/infrastructure/project-skill-assignments-repo.ts` with raw queries: `insert`, `findByProjectAndSkill`, `deleteByProjectAndSkill`, `listByProject` (both requirement levels, joined to `prompts` for the `listPrompts` union), `listRequiredSkillNamesByProject` (filtered `requirement = 'required'`, `prompts.name` only, per `data-model.md`'s Query Shapes)
- [ ] T008 Extend `src/bcs/prompt-registry/infrastructure/projects-repo.ts`'s `listByTeam` to match owner OR collaborator team (`WHERE team_id = :teamId OR id IN (SELECT project_id FROM project_teams WHERE team_id = :teamId)`), org-scoped, name-ordered (research.md §5, FR-024)
- [ ] T009 Extend `src/bcs/prompt-registry/infrastructure/prompts-repo.ts` with a project-assigned-skills query (e.g. `listAssignedToProject(tx, organizationId, projectId)`) joining `project_skill_assignments` → `prompts`, for the `listPrompts` `projectId` union (research.md §4)
- [ ] T010 Create `src/bcs/prompt-registry/application/project-team-test-helpers.ts` — shared fixtures: `makeProjectTeamFixtureOrg` (two orgs, a project with a real owner team, a second same-org team, a cross-org team, an owner-team-admin actor, a non-admin member actor), `createTestSkillOwnedByTeam` (reuse from `subscription-test-helpers.ts` if already exported, else re-derive locally), `queryProjectTeamRows`/`queryProjectSkillAssignmentRows`/`queryAuditEvents` (mirrors `subscription-test-helpers.ts`'s shape)

---

## Phase 3: User Story 1 — Establish a project's participating teams (P1)

**Goal**: A project's owner-team administrator adds and removes collaborator teams, making "which teams participate in this project" an explicit, queryable fact.

**Independent Test**: Create a project and a second same-org team, add it as a collaborator, confirm it appears in the project's participating-teams list and in that team's own project list, remove it, confirm both no longer show it.

- [ ] T011 [US1] Create `src/bcs/prompt-registry/application/add-collaborator-team.ts` — `addCollaboratorTeam(db, actingUser, projectId, { teamId }, auditContext?)`: loads the project (org-scoped), rejects if `teamId === project.teamId` (`OwnerTeamCannotBeCollaboratorError`, FR-020), rejects if `teamId` does not belong to the project's organization (`ProjectTeamOrgMismatchError`, FR-021), calls `assertAuthorizedForOwner(tx, actingUser, "team", project.teamId)` (research.md §1), rejects duplicate `(projectId, teamId)` (`DuplicateCollaboratorTeamError`), writes the row via `withAudit` with action `"project_team.added"`
- [ ] T012 [P] [US1] Create `src/bcs/prompt-registry/application/add-collaborator-team.test.ts` — tests: owner-team admin adds a same-org team (record created, audit event recorded); non-admin caller rejected; cross-org team rejected (no row, no audit event); adding the project's own owner team as a collaborator rejected; duplicate add rejected
- [ ] T013 [US1] Create `src/bcs/prompt-registry/application/remove-collaborator-team.ts` — `removeCollaboratorTeam(db, actingUser, projectId, { teamId }, auditContext?)`: loads the project, calls `assertAuthorizedForOwner`, rejects removal of a team that is not currently a collaborator (`CollaboratorTeamNotFoundError`, FR-023) with no side effects, deletes the row via `withAudit` with action `"project_team.removed"`
- [ ] T014 [P] [US1] Create `src/bcs/prompt-registry/application/remove-collaborator-team.test.ts` — tests: owner-team admin removes an existing collaborator (record removed, audit event recorded); non-admin caller rejected; removing a team that was never a collaborator rejected with no side effects and no audit event
- [ ] T015 [US1] Create `src/bcs/prompt-registry/application/list-project-teams.ts` — `listProjectTeams(db, orgId, projectId)`: direct org-scoped read of `project_teams` rows for the project (does not include the owner team — `data-model.md`'s documented convention)
- [ ] T016 [P] [US1] Create `src/bcs/prompt-registry/application/list-project-teams.test.ts` — tests: returns every current collaborator team; excludes the owner team itself; excludes a removed collaborator; cross-org project id returns empty/not-found consistent with `getProject`'s existing convention
- [ ] T017 [P] [US1] Extend `src/bcs/prompt-registry/infrastructure/projects-repo.test.ts` (or add to `list-project-teams.test.ts`) proving `listByTeam` includes a project for a team that participates only as a collaborator, not as the owner (Story 1 Acceptance Scenario 7, FR-024)

---

## Phase 4: User Story 2 — Assign a skill from a participating team's catalog to a project (P1)

**Goal**: A project administrator assigns a skill already owned by the project's owner or a collaborator team, marking it required or optional; ineligible targets (non-participating team, personal skill) are rejected.

**Independent Test**: Create a project with an owner team and a collaborator team, each owning a skill; assign both (one required, one optional); confirm both assignments are recorded with the correct requirement level.

- [ ] T018 [US2] Create `src/bcs/prompt-registry/application/assign-skill-to-project.ts` — `assignSkillToProject(db, actingUser, projectId, skillId, { requirement }, auditContext?)`: loads the project (org-scoped; nonexistent/cross-org throws the existing `ProjectNotFoundError`) and the skill (org-scoped; nonexistent/cross-org throws the existing `SourceSkillNotFoundError`, reused from `domain/subscription.ts`), calls `assertAuthorizedForOwner(tx, actingUser, "team", project.teamId)`, rejects `skill.ownerType === "user"` unconditionally (`PersonalSkillNotAssignableError`, FR-004 — even when the acting user is that skill's own owner), rejects when `skill.ownerType === "team"` and `skill.ownerId` is neither `project.teamId` nor a row in `project_teams` for this project (`SkillNotEligibleForProjectError`, FR-003), rejects duplicate `(projectId, skillId)` (`DuplicateProjectSkillAssignmentError`), writes the row via `withAudit` with action `"project_skill_assignment.assigned"` including the `requirement`
- [ ] T019 [P] [US2] Create `src/bcs/prompt-registry/application/assign-skill-to-project.test.ts` — tests: assign a skill owned by the owner team as `required` (recorded, audited); assign a skill owned by a collaborator team as `optional` (recorded, audited); assign a skill owned by a non-participating team rejected (no row, no audit event); assign a personal skill rejected even when the acting user owns it and administers the project; duplicate assignment rejected; **deprecate the assigned skill afterward and confirm the assignment row and its `requirement` are unaffected (FR-017, found during `/speckit-analyze`, finding E1)**

---

## Phase 5: User Story 3 — Retrieve the required-skill list for enforcement (P1)

**Goal**: An external consumer retrieves the flat list of a project's `required`-marked skill names, with no team-chain resolution.

**Independent Test**: Assign one skill as `required` and another as `optional`; confirm the retrieved list contains only the required skill's name.

- [ ] T020 [US3] Create `src/bcs/prompt-registry/application/list-required-skills-for-project.ts` — `listRequiredSkillsForProject(db, orgId, projectId)`: thin wrapper over `project-skill-assignments-repo.listRequiredSkillNamesByProject`, no actor/authorization parameter (spec FR-009 — a direct catalog read)
- [ ] T021 [P] [US3] Create `src/bcs/prompt-registry/application/list-required-skills-for-project.test.ts` — tests: returns only `required`-marked skill names, excluding `optional` ones; returns an empty list for a project with no assignments (not an error); includes a required skill contributed by a collaborator team exactly the same as one from the owner team (no distinction)

---

## Phase 6: User Story 4 — Project members access everything assigned to their project (P2)

**Goal**: A project member's accessible-skill query, when scoped to their project, includes every skill assigned to that project regardless of which participating team contributed it; a non-member sees no such addition.

**Independent Test**: Assign a collaborator team's skill to a project; add a member who belongs only to the owner team; confirm that member's project-scoped accessible list includes the collaborator's skill.

- [ ] T022 [US4] Rewrite `src/bcs/prompt-registry/application/list-prompts.ts` to accept an optional third parameter `{ projectId?: string }`: when given, checks project membership via `project-members-repo.findByProjectAndUser`; if a member, unions the project's assigned skills (via T009's repo query, both requirement levels) into the base accessible set, deduped by skill id; if not a member, `projectId` is silently ignored (research.md §4, FR-012/FR-013)
- [ ] T023 [P] [US4] Extend `src/bcs/prompt-registry/application/list-prompts.test.ts` — tests: a project member sees a collaborator-team-contributed assigned skill even without belonging to that team; an assigned-but-not-yet-fetched skill owned by a collaborator team the caller has no other relationship to does NOT appear without the `projectId` filter; a skill owned by a collaborator team but never assigned to the project does not appear even with the `projectId` filter; a non-member's result is unaffected by passing `projectId` (identical to omitting it)

---

## Phase 7: User Story 5 — Remove a skill assignment (P2)

**Goal**: A project administrator unassigns a previously assigned skill, reversibly, with no side effects on a nonexistent assignment.

**Independent Test**: Assign a skill, confirm it appears in the required/accessible lists as applicable, unassign it, confirm it no longer appears in either.

- [ ] T024 [US5] Create `src/bcs/prompt-registry/application/unassign-skill-from-project.ts` — `unassignSkillFromProject(db, actingUser, projectId, skillId, auditContext?)`: loads the project (org-scoped; nonexistent/cross-org throws the existing `ProjectNotFoundError`), calls `assertAuthorizedForOwner`, rejects an unassign for a skill not currently assigned (`ProjectSkillAssignmentNotFoundError`, FR-008) with no side effects, deletes the row via `withAudit` with action `"project_skill_assignment.unassigned"`
- [ ] T025 [P] [US5] Create `src/bcs/prompt-registry/application/unassign-skill-from-project.test.ts` — tests: unassign an existing assignment (removed, audited); the required-skill list no longer includes it afterward; `listPrompts` with `projectId` no longer includes it afterward; unassigning a nonexistent assignment rejected with no side effects and no audit event

---

## Phase 8: Polish & Cross-Cutting

- [ ] T026 Extend `src/bcs/prompt-registry/index.ts` to re-export `addCollaboratorTeam`, `removeCollaboratorTeam`, `listProjectTeams`, `assignSkillToProject`, `unassignSkillFromProject`, `listRequiredSkillsForProject`, and all new types/errors from `domain/project-team.ts` and `domain/project-skill-assignment.ts`
- [ ] T027 Review `src/bcs/prompt-registry/CONTRACT.md` (the `assignSkillToProject`/`unassignSkillFromProject`/`addCollaboratorTeam`/`removeCollaboratorTeam`/`listProjectTeams` rows already stubbed by PDR-016) against what was actually implemented — correct the `actingUserId: string` stub to the real `actingUser: UserSummary` shape (research.md §8), matching how `020-prompt-sharing` updated `subscribeSkill`'s row
- [ ] T028 Update `backlog/006-prompt-registry/001-project-model-and-membership.md`'s Technical Notes to record that this feature (`022-project-skill-assignment`) delivered the `project_teams` table, both invariants, and owner-or-collaborator `listProjectsByTeam` matching on `001`'s behalf — leave `001`'s own remaining, unrelated requirements (if any) and `status: open` untouched (Complexity Tracking's "document thoroughly on both sides" commitment)
- [ ] T029 Generate and apply a Drizzle migration for `prompt_registry.project_teams` (`0018_prompt_registry_project_teams.sql`) — per `CLAUDE.md`'s documented workaround for this repo's missing-snapshot-files gap: let `pnpm db:generate` produce its diff, keep the auto-generated snapshot, hand-trim the `.sql` file to just this real change, rename the file and its `_journal.json` `tag` to this repo's `<timestamp>_prompt_registry_project_teams` convention, and verify the new entry's `when` isn't out of order
- [ ] T030 Generate and apply a second Drizzle migration for `prompt_registry.project_skill_assignments` (`0019_prompt_registry_project_skill_assignments.sql`) — same process as T029
- [ ] T031 Run `pnpm typecheck`, `pnpm lint`, and `pnpm vitest run src/bcs/prompt-registry src/bcs/audit-compliance` — fix any failures before considering this feature done

---

## Dependencies

```
T002 → T018, T024, T011, T013 (audit verbs must exist before any function writes them)
T003 → T006, T007, T008, T009 (schema needed by repos)
T004 → T006, T011, T013 (project-team domain types/errors needed everywhere collaborator teams are touched)
T005 → T007, T018, T024 (project-skill-assignment domain types/errors)
T006 → T008 (owner-or-collaborator listByTeam needs the project_teams table to query), T011, T013, T015, T018 (eligibility check reads project_teams)
T007 → T009, T018, T020, T024
T009 → T022
T010 → T012, T014, T016, T017, T019, T021, T023, T025 (shared fixtures needed by every story's tests)
T011 → T012
T013 → T014
T015 → T016, T017
T011...T017 → T018 (assignment eligibility needs collaborator teams to exist and be queryable)
T018 → T019
T018 → T020 (required-skill list needs assignments to exist to prove filtering)
T020 → T021
T018 → T022 (listPrompts union needs assignments to exist)
T022 → T023
T018 → T024 (can't unassign before assign exists)
T024 → T025
T011...T025 → T026 → T027 → T028 → T029 → T030 → T031
```

## Parallel Execution

Within each phase, tasks marked `[P]` can run in parallel (different files).

Phase 2: T004, T005 can run in parallel (different domain files) once T003 lands.
Phase 3: T012 after T011; T014 after T013; T016/T017 after T015 — T011/T013/T015 themselves can proceed in parallel once T004/T006/T010 are done (different application files).
Phase 4: T019 after T018.
Phase 5: T021 after T020.
Phase 6: T023 after T022.
Phase 7: T025 after T024.

## Implementation Strategy

**MVP = Phase 3 + Phase 4 + Phase 5** (all three P1 stories: establish participating teams, assign a skill, retrieve the required-skill list). These three are tightly coupled — assignment has nothing to validate eligibility against without participating teams existing, and the required-skill list has nothing to filter without assignments existing — so, matching `020-prompt-sharing`'s precedent of bundling its two P1 stories, none of the three delivers the feature's actual value (an enforceable "required skill" a PR check can read) alone. Phase 6 (project members' unified access) and Phase 7 (unassign) are each independently testable P2 increments layered on top.
