# Research: Project Skill Assignment

No `NEEDS CLARIFICATION` markers remain in `spec.md` after `/speckit-clarify` — the one open question (whether to pull `project_teams` forward from `001`) was resolved there. This document records implementation-level decisions made while translating the spec into a concrete design.

## 1. Authorization: reuse `authorize-owner-action.ts`, don't duplicate it

**Decision**: Both collaborator-team management (`addCollaboratorTeam`/`removeCollaboratorTeam`) and skill-assignment mutations (`assignSkillToProject`/`unassignSkillFromProject`) call the existing `assertAuthorizedForOwner(tx, actingUser, "team", project.teamId)` (from `020-prompt-sharing`) to enforce "an admin of the project's owner team."

**Rationale**: `assertAuthorizedForOwner`'s `ownerType: "team"` branch already implements exactly this rule — org admin OR `team.ownerId === actingUser.id` — via `identity-access`'s exported `getTeam`. Spec FR-014/FR-022 both describe this identical rule applied to a project's owner team. Writing a second, differently-named copy of the same three lines would violate this repo's own established anti-duplication lesson (`teams-repo.ts`'s `findByParent` bug note, and the documented non-export of `assertCanManageInvitationsForTeam` forcing local re-derivation *once*, not per-caller). Since `authorize-owner-action.ts` already lives in this same bounded context (not a cross-BC import), reuse is a plain function call, not a boundary violation.

**Alternatives considered**: A new `assertProjectOwnerTeamAdmin` helper duplicating the same logic — rejected as needless duplication of a rule this codebase already has exactly once. Skipping authorization entirely (matching `createProject`/`updateProject`'s current no-authorization state, per `001`'s own spec Assumptions deferring authorization to Distribution) — rejected because this feature's own spec (FR-014/FR-022) explicitly requires it, unlike `001`'s original scope.

**Signature consequence**: `addCollaboratorTeam`, `removeCollaboratorTeam`, `assignSkillToProject`, and `unassignSkillFromProject` all take `actingUser: UserSummary` (identity-access's exported shape), not the narrower `ProjectActor` the existing read-only project functions use — matching `subscribeSkill`/`forkSkill`'s established precedent for any function needing a team-authorization check. `listProjectTeams` and `listRequiredSkillsForProject` (pure reads, no authorization gate per spec — Story 3's required-skill list is explicitly for an unauthenticated-relative external consumer) keep the simpler `(db, orgId, projectId)` shape.

## 2. Skill-assignment eligibility check

**Decision**: `assignSkillToProject` resolves the skill (`findPromptByOrgAndId`), rejects immediately if `ownerType === "user"` (`PersonalSkillNotAssignableError`), then checks `ownerType === "team" && (ownerId === project.teamId || ownerId is a row in project_teams for this project)` — else rejects with `SkillNotEligibleForProjectError`.

**Rationale**: Directly implements spec FR-003/FR-004. The owner-team check is a plain equality against `project.teamId` (no query); the collaborator check is `project-teams-repo.findByProjectAndTeam(tx, projectId, skill.ownerId)`.

## 3. `listRequiredSkillsForProject` is a flat name list, no team-chain resolution

**Decision**: One repo query joins `project_skill_assignments` (`requirement = 'required'`) to `prompts` and selects `prompts.name`, scoped by `project_skill_assignments.organization_id` (denormalized onto the assignment row, not re-derived via a join to `projects` each time — matches `subscriptions.organization_id`'s existing denormalization precedent for the same reason: every other table in this schema carries its own `organization_id` for uniform RLS/query scoping, not just tables with a direct FK need).

**Rationale**: Spec FR-009 explicitly forbids resolving any invoking user's team-inheritance chain — this is a direct catalog read, the entire reason `007` moved out of Governance under PDR-016. No caller/actor parameter is needed at all.

## 4. `listPrompts`'s `projectId` filter: membership gate, then union

**Decision**: `listPrompts(db, actor: PromptActor, options?: { projectId?: string })`. When `projectId` is given: look up membership via the existing `project-members-repo.findByProjectAndUser(db, projectId, actor.userId)`. If the caller is a member, fetch every skill assigned to that project (`project-skill-assignments-repo` joined to `prompts`, both `required` and `optional` — Story 4 does not distinguish) and union it (dedup by id) with the caller's ordinary accessible set. If the caller is not a member, `projectId` is silently ignored — the caller still gets their ordinary accessible set, no error (spec Story 4 Acceptance Scenario 3).

**Rationale**: Directly implements FR-012/FR-013. Silently ignoring `projectId` for a non-member (rather than throwing) matches this feature's read-only, additive nature — `listPrompts` has never thrown for an unreachable filter value elsewhere (e.g., an org with zero results already returns an empty list, not an error).

**Alternatives considered**: A separate `listProjectAccessibleSkills(db, actor, projectId)` function instead of extending `listPrompts` — rejected because the spec (Input, FR-012) and `bcs/prompt-registry/CONTRACT.md`'s `listPrompts` row already commit to extending the existing signature, and `020-prompt-sharing`'s own `CONTRACT.md` entry says the `projectId` filtering was "deferred to `007`" for exactly this signature.

## 5. `projects.listByTeam` matches owner OR collaborator

**Decision**: `projects-repo.listByTeam(tx, organizationId, teamId)` changes from `WHERE team_id = :teamId` to `WHERE team_id = :teamId OR id IN (SELECT project_id FROM project_teams WHERE team_id = :teamId)`, still scoped by `organizationId` and still ordered by name.

**Rationale**: Directly implements FR-024 / `001`'s original "a team's projects query matches on either owner or collaborator" requirement and Story 1's Acceptance Scenario 7.

## 6. Audit action verbs

**Decision**: Add four new verbs to `audit-compliance/domain/audit-event.ts`'s `AUDIT_ACTION_VERBS` (and matching `AUDIT_ACTION_VERB_COLORS`): `assigned` (violet, mirrors `shared`), `unassigned` (red, mirrors `unsubscribed`), `added` (green, mirrors `created`), `removed` (red, mirrors `deleted`/`revoked`). Action strings: `project_skill_assignment.assigned` / `project_skill_assignment.unassigned` (resourceType `project_skill_assignment`), `project_team.added` / `project_team.removed` (resourceType `project_team`).

**Rationale**: Matches the exact pattern `018-prompt-version-model` (adding `published`) and `020-prompt-sharing` (adding `subscribed`/`unsubscribed`/`forked`) each established — extend the shared enum rather than freehand a new action string outside it (the type would reject an unlisted verb).

## 7. Migration split: two files, not one

**Decision**: `0018_prompt_registry_project_teams.sql` and `0019_prompt_registry_project_skill_assignments.sql`, generated and hand-trimmed separately (per `CLAUDE.md`'s documented `pnpm db:generate` snapshot-drift gotcha — the latest committed snapshot is `0017`, so a generated diff should be clean this time, but the resulting `.sql` must still be reviewed before commit).

**Rationale**: Two independent tables with independent ownership stories (one pulled forward from `001`, one native to `007`) — matches this repo's one-migration-per-logical-change convention (e.g. `0012_prompt_registry_projects` and `0013_prompt_registry_prompts` were separate migrations landed together, not merged into one file).

## 8. `CONTRACT.md` update, not a fresh write

**Decision**: `assignSkillToProject`/`unassignSkillFromProject`/`addCollaboratorTeam`/`removeCollaboratorTeam`/`listProjectTeams` rows already exist in `bcs/prompt-registry/CONTRACT.md` (added by PDR-016 as forward-looking stubs). Only the signature detail needs correcting — the stub shows `actingUserId: string`; the real implementation (per Decision 1) takes `actingUser: UserSummary`. Update in place, following `020-prompt-sharing`'s precedent of updating `subscribeSkill`'s row the same way once its real signature existed.

**Rationale**: Avoids two contract rows describing two different mechanisms for the same function, the exact risk PDR-016 itself flagged as a "Risk" it committed to tracking.
