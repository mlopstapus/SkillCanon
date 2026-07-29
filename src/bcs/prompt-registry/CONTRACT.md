# Prompt Registry — Contract

**Owner:** Ben Anderson
**Status:** Draft

## Purpose

Owns `Project`, `Prompt` (a "skill"), `PromptVersion`, `Subscription`, `ProjectTeam`, `ProjectSkillAssignment`, and the expansion engine — the other core-domain context. Expansion renders a prompt version's templates against caller input, weaves in Governance's effective policies/objectives, and resolves recursive prompt-inclusion references up to a max depth. This context calls Governance through its read contract only — it must never query `governance.*` tables directly, since that coupling is exactly what made the current Python `expand_prompt` hard to reason about.

A skill is owned by exactly one user or exactly one team, never derived from a project ([PDR-016](../../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)). Ownership, sharing (subscribe/fork), and project usage (assignment) are three independent concerns — a project draws only from the catalogs of the teams actually working on it, and never references a personal skill directly.

## Exposed APIs

| Endpoint / Method | Description | Consumers |
|---|---|---|
| `expand(orgId, promptName, input, { userId?, projectId?, version? })` | Returns `{ systemMessage, userMessage, appliedPolicies }`. Governance policies applied are always resolved from the *invoking user's* own team chain — never from the skill's owning team, even when the invoked skill is a subscribed/forked-in one owned elsewhere ([PDR-016](../../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)). | Workflow Orchestration, Distribution (`sh-run`) |
| `listPrompts(orgId, userId, { projectId?, page, pageSize })` | The caller's effective catalog: skills they own, skills they personally subscribe to, their own team's skills — plus, when `projectId` is given, everything that project has assigned (required or optional), regardless of which participating team contributed it. | Distribution (`sh-list`, `sh-search`, UI) |
| `getPrompt(orgId, name)` | Latest version + metadata | Distribution, Workflow Orchestration (step validation) |
| `getPromptById(orgId, promptId)` | Prompt metadata by id (vs. `getPrompt`'s by-name lookup); `null` for nonexistent or cross-organization ids (020-audit-log-ui) | Audit & Compliance (audit log UI resource-name resolution) |
| `getPromptVersion(orgId, versionId)` | One prompt version by id, org-scoped via a join through its owning prompt (`prompt_versions` has no `organization_id` column of its own); `null` for nonexistent or cross-organization ids (020-audit-log-ui) | Audit & Compliance (audit log UI resource-name resolution) |
| `getProject(orgId, projectId)` | Project metadata including its owning `teamId`; returns no row for nonexistent or cross-organization ids. | VCS Integration (repo↔project linking), Distribution |
| `listProjectsByOrganization(orgId)` / `listProjectsByTeam(orgId, teamId)` | Organization- and team-scoped project lists (by owner **or** collaborator team) in project-name order. | Distribution, VCS Integration |
| `createProject`, `updateProject`, `deleteProject` | Project lifecycle operations; validate Identity references through Identity & Access read contracts and write `project.created` / `project.updated` / `project.deleted` audit events transactionally. `updateProject`'s team-admin operations (add/remove collaborator team, rename, delete) are restricted to the project's **owner team**. | Distribution (route handlers) |
| `addProjectMember`, `listProjectMembers`, `removeProjectMember` | Project membership operations; same-organization users from any team may be members, duplicate `(projectId, userId)` grants are rejected, and member mutations are audited transactionally. | Distribution (route handlers) |
| `addCollaboratorTeam`, `removeCollaboratorTeam`, `listProjectTeams` | Owner-team-only operations managing a project's collaborator teams; the owner team itself is not a row in `project_teams` — it's `projects.team_id`, never removable via this API (delete the project instead). | Distribution (route handlers) |
| `createPrompt`, `publishVersion` | Skill lifecycle, org-scoped. `createPrompt`'s owner is always the creating user (`ownerType: "user"`) — becoming team-owned only happens via `subscribeSkill`/`forkSkill` from a team. | Distribution (route handlers) |
| `subscribeSkill(orgId, sourceSkillId, { subscriberType, subscriberId, actingUserId })` | Creates a live reference: the subscriber (a user or a team) always resolves the source's *current* active version. Revocable by the subscriber or (if `subscriberType: "team"`) any of that team's admins. | Distribution (route handlers) |
| `unsubscribeSkill(orgId, subscriptionId, actingUserId)` | Removes a subscription. Does not affect the source skill or any other subscriber. | Distribution (route handlers) |
| `forkSkill(orgId, sourceSkillId, { ownerType, ownerId, actingUserId })` | Creates an independent copy of the source's current active version under a new owner (a user or a team), stamped with `forkedFromSkillId` pointing back at the source for lineage/audit. The fork never syncs further — it's a new `Prompt` row from that point on. | Distribution (route handlers) |
| `assignSkillToProject(orgId, projectId, skillId, { requirement: "required" \| "optional", actingUserId })` | Assigns a skill to a project. Rejected unless `skillId`'s owner is one of the project's participating teams (owner or collaborator) — a personal skill must be subscribed/forked into a team first. | Distribution (route handlers) |
| `unassignSkillFromProject(orgId, projectId, skillId, actingUserId)` | Removes an assignment. | Distribution (route handlers) |
| `listRequiredSkillsForProject(orgId, projectId)` | Flat list of skill names assigned to the project with `requirement: "required"`. No team-chain resolution involved — this is a direct catalog read, not a Governance concern ([PDR-016](../../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)). | VCS Integration (PR evaluation) |

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
