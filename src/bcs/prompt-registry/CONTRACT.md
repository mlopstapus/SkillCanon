# Prompt Registry — Contract

**Owner:** Ben Anderson
**Status:** Draft

## Purpose

Owns `Project`, `Prompt` (a "skill"), `PromptVersion`, `Subscription`, `ProjectTeam`, `ProjectSkillAssignment`, and the expansion engine — the other core-domain context. Expansion renders a prompt version's templates against caller input, weaves in Governance's effective policies/objectives, and resolves recursive prompt-inclusion references up to a max depth. This context calls Governance through its read contract only — it must never query `governance.*` tables directly, since that coupling is exactly what made the current Python `expand_prompt` hard to reason about.

A skill is owned by exactly one user or exactly one team, never derived from a project ([PDR-016](../../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)). Ownership, sharing (subscribe/fork), and project usage (assignment) are three independent concerns — a project draws only from the catalogs of the teams actually working on it, and never references a personal skill directly.

## Exposed APIs

| Endpoint / Method | Description | Consumers |
|---|---|---|
| `expand(db, { organizationId, promptName, input, userId?, projectId?, version? })` | Returns `{ systemMessage, userMessage, appliedPolicies, objectives }` (021-expansion-engine). Governance policies applied are always resolved from the *invoking user's* own team chain — never from the skill's owning team, even when the invoked skill is a subscribed/forked-in one owned elsewhere ([PDR-016](../../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)). `projectId` is forwarded only into objective resolution (Policy has no project scope at all under PDR-016). No `userId` given means fully ungoverned — zero policies, zero objectives, no fallback identity (there is no single-user "skill owner" to borrow once a skill can be team-owned). Nested `include_prompt('name')` references (template-invoked, never automatic) resolve up to `MAX_INCLUDE_DEPTH` (3); depth-exceeded or a not-found name both degrade to a plain inline placeholder string rather than throwing. A deprecated skill, or one with no published version, is rejected the same way a nonexistent one would be (`ExpansionSourceNotFoundError`), even when a specific still-existing version is explicitly requested. A skill's declared `input_schema` is never validated against caller input (deliberate, matches legacy). A pure read — no audit write. | Workflow Orchestration, Distribution (`sh-run`) |
| `listPrompts(db, actor: { organizationId, userId })` | The caller's *accessible* set (020-prompt-sharing): skills they own, skills their own team owns, and skills they (or their team) subscribe to. Resolves the caller's own `teamId` internally via Identity & Access's `getUser`. The `projectId`/`page`/`pageSize` filtering described here previously is **not yet implemented** — deferred to `backlog/006-prompt-registry/007-project-skill-assignment.md`, which still depends on this signature. | Distribution (`sh-list`, `sh-search`, UI) |
| `listSkillsByOrganization(db, organizationId)` | The *discoverable* set (020-prompt-sharing, FR-019/FR-020): every skill in the organization, unfiltered by ownership/subscription/team membership — a direct passthrough to the existing org-wide repo query. Broader than `listPrompts`'s accessible set; governs visibility, not usability for invocation. | Distribution (`sh-list --all`, UI catalog browse) |
| `getPrompt(orgId, name)` | Latest version + metadata | Distribution, Workflow Orchestration (step validation) |
| `getPromptById(orgId, promptId)` | Prompt metadata by id (vs. `getPrompt`'s by-name lookup); `null` for nonexistent or cross-organization ids (020-audit-log-ui) | Audit & Compliance (audit log UI resource-name resolution) |
| `getPromptVersion(orgId, versionId)` | One prompt version by id, org-scoped via a join through its owning prompt (`prompt_versions` has no `organization_id` column of its own); `null` for nonexistent or cross-organization ids (020-audit-log-ui) | Audit & Compliance (audit log UI resource-name resolution) |
| `getProject(orgId, projectId)` | Project metadata including its owning `teamId`; returns no row for nonexistent or cross-organization ids. | VCS Integration (repo↔project linking), Distribution |
| `listProjectsByOrganization(orgId)` / `listProjectsByTeam(orgId, teamId)` | Organization- and team-scoped project lists (by owner **or** collaborator team) in project-name order. | Distribution, VCS Integration |
| `createProject`, `updateProject`, `deleteProject` | Project lifecycle operations; validate Identity references through Identity & Access read contracts and write `project.created` / `project.updated` / `project.deleted` audit events transactionally. `updateProject`'s team-admin operations (add/remove collaborator team, rename, delete) are restricted to the project's **owner team**. | Distribution (route handlers) |
| `addProjectMember`, `listProjectMembers`, `removeProjectMember` | Project membership operations; same-organization users from any team may be members, duplicate `(projectId, userId)` grants are rejected, and member mutations are audited transactionally. | Distribution (route handlers) |
| `addCollaboratorTeam(db, actingUser: UserSummary, projectId, { teamId }, auditContext?)` / `removeCollaboratorTeam(db, actingUser: UserSummary, projectId, { teamId }, auditContext?)` | Owner-team-only operations managing a project's collaborator teams (022-project-skill-assignment, pulled forward from `001`); the owner team itself is not a row in `project_teams` — it's `projects.team_id`, never removable via this API (delete the project instead). `actingUser` is Identity & Access's exported `UserSummary` shape, checked via the same org-admin-or-team-owner rule `subscribeSkill`/`forkSkill` already use (`authorize-owner-action.ts`, reused not duplicated). Rejects a cross-org team, the owner team naming itself as a collaborator, and duplicates. | Distribution (route handlers) |
| `listProjectTeams(db, orgId, projectId)` | A project's current collaborator teams (excludes the owner team — see above). A pure, unauthenticated read. | Distribution (route handlers), VCS Integration |
| `createPrompt`, `publishVersion` | Skill lifecycle, org-scoped. `createPrompt`'s owner is always the creating user (`ownerType: "user"`) — becoming team-owned only happens via `subscribeSkill`/`forkSkill` from a team. | Distribution (route handlers) |
| `subscribeSkill(db, actingUser: UserSummary, sourceSkillId, { subscriberType, subscriberId }, auditContext?)` | Creates a live reference: the subscriber (a user or a team) always resolves the source's *current* active version. Revocable by the subscriber or (if `subscriberType: "team"`) an admin/owner of that team. Rejects self-subscription, duplicates, and any subscriber outside `actingUser`'s own organization. `actingUser` is Identity & Access's exported `UserSummary` shape (`{ id, orgId, teamId, role, email }`), not this BC's narrower `PromptActor` — needed for the org-admin-or-team-owner authorization check. | Distribution (route handlers) |
| `unsubscribeSkill(db, actingUser: UserSummary, subscriptionId, auditContext?)` | Removes a subscription. Does not affect the source skill or any other subscriber. A nonexistent subscription and one the caller has no authority over are both rejected (distinct error types; see `domain/subscription.ts`). | Distribution (route handlers) |
| `forkSkill(db, actingUser: UserSummary, sourceSkillId, { ownerType, ownerId }, auditContext?)` | Creates an independent copy of the source's current active version under a new owner (a user or a team), stamped with `forkedFromSkillId` pointing back at the source for lineage/audit. The fork never syncs further — it's a new `Prompt` row from that point on. Rejects forking into an owner that already owns the source (FR-021). | Distribution (route handlers) |
| `assignSkillToProject(db, actingUser: UserSummary, projectId, skillId, { requirement: "required" \| "optional" }, auditContext?)` | Assigns a skill to a project. Rejected unless `skillId`'s owner is one of the project's participating teams (owner or collaborator) — a personal skill (`ownerType: "user"`) is rejected unconditionally, even for its own owner; it must be subscribed/forked into a team first. `actingUser` checked via the same owner-team-admin rule as `addCollaboratorTeam`. Unaffected by the skill's own later lifecycle changes (e.g. deprecation). | Distribution (route handlers) |
| `unassignSkillFromProject(db, actingUser: UserSummary, projectId, skillId, auditContext?)` | Removes an assignment. Rejects an unassign for a skill not currently assigned, with no side effects. | Distribution (route handlers) |
| `listRequiredSkillsForProject(db, orgId, projectId)` | Flat list of skill names assigned to the project with `requirement: "required"`. No team-chain resolution or actor parameter involved — this is a direct catalog read, not a Governance concern ([PDR-016](../../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)). | VCS Integration (PR evaluation) |

## Events Published

| Event | Payload summary | Consumers |
|---|---|---|
| `PromptCreated` / `PromptVersionPublished` | orgId, promptId, versionId, actorUserId | Audit |
| `SkillSubscribed` / `SkillUnsubscribed` | orgId, sourceSkillId, subscriberType, subscriberId, actorUserId | Audit |
| `SkillForked` | orgId, sourceSkillId, forkedSkillId, ownerType, ownerId, actorUserId | Audit |
| `ProjectSkillAssigned` / `ProjectSkillUnassigned` | orgId, projectId, skillId, requirement, actorUserId | Audit |
| `PromptExpanded` | orgId, promptId, versionId, callerUserId, appliedPolicyIds | Distribution (writes `PromptUsage`), Audit |

## Events Consumed

| Event | From BC | What this BC does with it |
|---|---|---|
| none | — | Expansion always calls Governance synchronously at request time; it does not react to Governance events |

## Data Contracts

```ts
interface ExpansionResult {
  systemMessage: string | null;
  userMessage: string;
  appliedPolicies: string[]; // policy names, for transparency to the caller
  objectives: string[]; // resolved objective titles, template-visible context only (021-expansion-engine)
}

type OwnerType = "user" | "team";

interface PromptSummary {
  id: string; orgId: string; name: string; description: string | null;
  isDeprecated: boolean;
  ownerType: OwnerType; ownerId: string; // exactly one owner, never derived from a project
  forkedFromSkillId: string | null; // lineage pointer, set only when this skill was created via forkSkill
  latestVersion: { version: string; tags: string[] } | null;
}

interface Project {
  id: string; orgId: string; teamId: string; // owner team — admin rights (rename, manage collaborators, delete)
  leadUserId: string | null; name: string; slug: string; description: string | null;
  createdAt: Date; updatedAt: Date;
}
interface ProjectMember {
  id: string; projectId: string; userId: string; role: string; createdAt: Date;
}
interface ProjectTeam {
  id: string; projectId: string; teamId: string; // a collaborator team — the owner team is projects.team_id, not a row here
  createdAt: Date;
}
interface Subscription {
  id: string; orgId: string;
  sourceSkillId: string;
  subscriberType: OwnerType; subscriberId: string;
  createdAt: Date;
}
interface ProjectSkillAssignment {
  id: string; orgId: string; projectId: string; skillId: string;
  requirement: "required" | "optional";
  createdAt: Date;
}
```

`name` and `slug` are unique **within an organization**, not globally — corrected from the current single-tenant schema. Project member uniqueness is persisted on `(project_id, user_id)`; collaborator-team uniqueness on `(project_id, team_id)`; subscription uniqueness on `(source_skill_id, subscriber_type, subscriber_id)`; assignment uniqueness on `(project_id, skill_id)`.

## Stability Guarantees

`expand()`'s output shape and the recursive-inclusion max depth (`MAX_INCLUDE_DEPTH`) are stable; increasing the depth limit is backward compatible, decreasing it is not. A skill's `ownerType`/`ownerId` never changes in place — a skill that should have a different owner is forked (a new row, new owner, `forkedFromSkillId` lineage), not reassigned.

## Breaking Change Policy

Changes to template syntax (Nunjucks tag set) or inclusion resolution order are called out in the PR description and, if they change existing prompt output, require a PDR. Changes to what "assigned to a project" or "subscribed to" mean for access/visibility purposes require a PDR — see [PDR-016](../../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)'s access-model reasoning.
