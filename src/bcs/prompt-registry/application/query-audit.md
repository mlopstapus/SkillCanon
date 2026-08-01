# Prompt Registry Query Audit

Scope: [SKI-42](mention://issue/00acaf35-7e7a-41fc-8928-4a42f3cc76e0) Prompt Registry tenant isolation tests, covering features 001 (project model & membership), 002 (prompt & version model), 003 (skill sharing — subscribe & fork), and 007 (project skill assignment). Audit date: 2026-07-30.

## Result

Zero remaining Prompt Registry project/prompt/version/subscription/project-skill-assignment service queries target tenant-scoped rows without filtering by the caller's `organizationId` — directly, or indirectly through a parent row (`project`, `prompt`) that was itself already resolved with an `organizationId` filter before its id is used in a follow-up query.

## Feature 001 — Project model & membership (projects, project_members, project_teams)

| File | Query path | Tenant filter result |
| ---- | ---------- | -------------------- |
| `src/bcs/prompt-registry/application/create-project.ts` | `createProject()` inserts with `params.organizationId`, verified against `actor.organizationId` first (`ProjectOrganizationNotFoundError` guard). | Pass |
| `src/bcs/prompt-registry/application/get-project.ts` | `getProject()` delegates to `findByOrgAndId(db, organizationId, projectId)`. | Pass |
| `src/bcs/prompt-registry/application/update-project.ts` | `updateProject()` reads and updates through `findByOrgAndId()` / `update()` with `actor.organizationId`. | Pass |
| `src/bcs/prompt-registry/application/delete-project.ts` | `deleteProject()` reads and deletes through `findByOrgAndId()` / `deleteByOrgAndId()` with `actor.organizationId`. | Pass |
| `src/bcs/prompt-registry/application/list-projects.ts` | `listProjectsByOrganization()`/`listProjectsByTeam()` delegate to `listByOrganization(db, organizationId)` / `listByTeam(db, organizationId, teamId)`. | Pass |
| `src/bcs/prompt-registry/application/add-project-member.ts` | `addProjectMember()` first resolves the project via `findByOrgAndId(db, actor.organizationId, params.projectId)`; insert is keyed off that already-scoped `projectId`. | Pass |
| `src/bcs/prompt-registry/application/remove-project-member.ts` | `removeProjectMember()` first resolves the project via `findByOrgAndId(db, actor.organizationId, projectId)` before any member read/delete. | Pass |
| `src/bcs/prompt-registry/application/list-project-members.ts` | `listProjectMembers()` first resolves the project via `findByOrgAndId(db, organizationId, projectId)`, returns `[]` (not the unscoped list) if that lookup misses. | Pass |
| `src/bcs/prompt-registry/application/add-collaborator-team.ts` | `addCollaboratorTeam()` first resolves the project via `findByOrgAndId(db, actingUser.orgId, projectId)`; the target `teamId` is separately verified same-org via `getTeam(db, actingUser.orgId, params.teamId)`. | Pass |
| `src/bcs/prompt-registry/application/remove-collaborator-team.ts` | `removeCollaboratorTeam()` first resolves the project via `findByOrgAndId(db, actingUser.orgId, projectId)` before any collaborator-team read/delete. | Pass |
| `src/bcs/prompt-registry/application/list-project-teams.ts` | `listProjectTeams()` first resolves the project via `findByOrgAndId(db, orgId, projectId)`, throwing `ProjectNotFoundError` if that lookup misses — `listByProject()` (unscoped by org) is only ever called with an already-org-verified `projectId`. | Pass |
| `src/bcs/prompt-registry/infrastructure/projects-repo.ts` | `findByOrgAndId()`, `findByOrgAndName()`, `findByOrgAndSlug()`, `update()`, `deleteByOrgAndId()`, `listByOrganization()`, `listByTeam()` all include `eq(projects.organizationId, organizationId)`. | Pass |
| `src/bcs/prompt-registry/infrastructure/project-teams-repo.ts` | No `organizationId` column on `project_teams`; every function is keyed by `projectId`/`teamId`, and every caller in `application/` resolves `projectId` through an org-scoped `findByOrgAndId()` first. | Pass (scoped by caller) |

## Feature 002 — Prompt & version model (prompts, prompt_versions)

| File | Query path | Tenant filter result |
| ---- | ---------- | -------------------- |
| `src/bcs/prompt-registry/application/create-prompt.ts` | `createPrompt()` inserts with `params.organizationId`; duplicate check via `findPromptByOrgAndName(db, params.organizationId, params.name)`. | Pass |
| `src/bcs/prompt-registry/application/get-prompt.ts` | Looks up by `(organizationId, name)` via `findPromptByOrgAndName`. | Pass |
| `src/bcs/prompt-registry/application/get-prompt-by-id.ts` | `getPromptById()` delegates to `findPromptByOrgAndId(db, organizationId, promptId)`. | Pass |
| `src/bcs/prompt-registry/application/deprecate-prompt.ts` | Resolves via `findPromptByOrgAndName(db, actor.organizationId, promptName)` first; the subsequent `updatePrompt(db, prompt.id, ...)` uses the already-org-verified `prompt.id`. | Pass |
| `src/bcs/prompt-registry/application/rollback-prompt.ts` | Resolves via `findPromptByOrgAndName(db, actor.organizationId, promptName)` and `findVersionByPromptAndLabel(db, prompt.id, targetVersion)` before the org-verified `updatePrompt(db, prompt.id, ...)`. | Pass |
| `src/bcs/prompt-registry/application/publish-version.ts` | Resolves the prompt via `findPromptByOrgAndName(db, actor.organizationId, params.promptName)`; the version insert and `updatePrompt()` call use that already-org-verified `prompt.id`. | Pass |
| `src/bcs/prompt-registry/application/get-prompt-version.ts` | `getPromptVersion()` looks up the version by raw id, then re-verifies its parent prompt via `findPromptByOrgAndId(db, organizationId, version.promptId)`, returning `null` if that fails. | Pass |
| `src/bcs/prompt-registry/application/list-versions.ts` | `listVersions()` first resolves the prompt via `findPromptByOrgAndName(db, actor.organizationId, promptName)`; `listVersionsByPrompt()` (unscoped by org) is only ever called with that already-verified `prompt.id`. | Pass |
| `src/bcs/prompt-registry/application/list-prompts.ts` | `listPrompts()` delegates to `listAccessibleByOwnerAndSubscriptions(db, actor.organizationId, ...)`. | Pass |
| `src/bcs/prompt-registry/application/list-skills-by-organization.ts` | `listSkillsByOrganization()` delegates to `listPromptsByOrg(db, organizationId)`. | Pass |
| `src/bcs/prompt-registry/infrastructure/prompts-repo.ts` | `findPromptByOrgAndName()`, `findPromptByOrgAndId()`, `listPromptsByOrg()`, `listAccessibleByOwnerAndSubscriptions()` all include `eq(prompts.organizationId, organizationId)`; `updatePrompt()` is keyed by `promptId` alone but every caller passes an already-org-verified id (see rows above). | Pass |
| `src/bcs/prompt-registry/infrastructure/prompt-versions-repo.ts` | No `organizationId` column on `prompt_versions`; `findVersionById()` and `listVersionsByPrompt()` are keyed by id/`promptId` alone, and every caller in `application/` resolves the parent prompt through an org-scoped lookup first (see `get-prompt-version.ts`, `list-versions.ts`, `publish-version.ts`, `rollback-prompt.ts` above). | Pass (scoped by caller) |

## Feature 003 — Skill sharing (subscribe & fork)

| File | Query path | Tenant filter result |
| ---- | ---------- | -------------------- |
| `src/bcs/prompt-registry/application/subscribe-skill.ts` | `subscribeSkill()` resolves the source skill via `findPromptByOrgAndId(db, actingUser.orgId, sourceSkillId)`; insert uses `actingUser.orgId`. | Pass |
| `src/bcs/prompt-registry/application/unsubscribe-skill.ts` | `unsubscribeSkill()` resolves the subscription via `findByOrgAndId(db, actingUser.orgId, subscriptionId)` before delete. | Pass |
| `src/bcs/prompt-registry/application/fork-skill.ts` | `forkSkill()` resolves the source skill via `findPromptByOrgAndId(db, actingUser.orgId, sourceSkillId)`; the new prompt/version rows are inserted with `actingUser.orgId`. | Pass |
| `src/bcs/prompt-registry/application/authorize-owner-action.ts` | `assertAuthorizedForOwner()` resolves a team target via `getTeam(tx, actingUser.orgId, ownerId)` (Identity Access's own org-scoped contract call); a personal (`"user"`) target only ever matches `actingUser.id` itself. | Pass |
| `src/bcs/prompt-registry/infrastructure/subscriptions-repo.ts` | `findByOrgAndId()`, `listBySubscriber()` include `eq(subscriptions.organizationId, organizationId)`; `findBySourceAndSubscriber()` and `deleteById()` are keyed by an already-org-verified `sourceSkillId`/`id` from their callers. | Pass |

## Feature 007 — Project skill assignment

| File | Query path | Tenant filter result |
| ---- | ---------- | -------------------- |
| `src/bcs/prompt-registry/application/assign-skill-to-project.ts` | `assignSkillToProject()` resolves both the project (`findByOrgAndId(db, actingUser.orgId, projectId)`) and the skill (`findPromptByOrgAndId(db, actingUser.orgId, skillId)`) before checking eligibility and inserting with `actingUser.orgId`. | Pass |
| `src/bcs/prompt-registry/application/unassign-skill-from-project.ts` | `unassignSkillFromProject()` resolves the project via `findByOrgAndId(db, actingUser.orgId, projectId)` before delete. | Pass |
| `src/bcs/prompt-registry/application/list-required-skills-for-project.ts` | `listRequiredSkillsForProject()` delegates to `listRequiredSkillNamesByProject(db, orgId, projectId)`. | Pass |
| `src/bcs/prompt-registry/infrastructure/project-skill-assignments-repo.ts` | `listByProject()` and `listRequiredSkillNamesByProject()` include `eq(projectSkillAssignments.organizationId, organizationId)`; `findByProjectAndSkill()`/`deleteByProjectAndSkill()`/`insert()` are keyed by an already-org-verified `projectId`/`skillId` from their callers. | Pass |
