# Prompt Registry — Contract

**Owner:** Ben Anderson
**Status:** Draft

## Purpose

Owns `Project`, `Prompt`, `PromptVersion`, `PromptShare`, and the expansion engine — the other core-domain context. Expansion renders a prompt version's templates against caller input, weaves in Governance's effective policies/objectives, and resolves recursive prompt-inclusion references up to a max depth. This context calls Governance through its read contract only — it must never query `governance.*` tables directly, since that coupling is exactly what made the current Python `expand_prompt` hard to reason about.

## Exposed APIs

| Endpoint / Method | Description | Consumers |
|---|---|---|
| `expand(orgId, promptName, input, { userId?, projectId?, version? })` | Returns `{ systemMessage, userMessage, appliedPolicies }` | Workflow Orchestration, Distribution (`sh-run`) |
| `listPrompts(orgId, userId, { page, pageSize })` | Prompts owned by or shared with the user | Distribution (`sh-list`, `sh-search`, UI) |
| `getPrompt(orgId, name)` | Latest version + metadata | Distribution, Workflow Orchestration (step validation) |
| `getPromptById(orgId, promptId)` | Prompt metadata by id (vs. `getPrompt`'s by-name lookup); `null` for nonexistent or cross-organization ids (020-audit-log-ui) | Audit & Compliance (audit log UI resource-name resolution) |
| `getPromptVersion(orgId, versionId)` | One prompt version by id, org-scoped via a join through its owning prompt (`prompt_versions` has no `organization_id` column of its own); `null` for nonexistent or cross-organization ids (020-audit-log-ui) | Audit & Compliance (audit log UI resource-name resolution) |
| `getProject(orgId, projectId)` | Project metadata including its owning `teamId`; returns no row for nonexistent or cross-organization ids. | Governance (`resolveRequiredSkillPolicies`), VCS Integration (repo↔project linking), Distribution |
| `listProjectsByOrganization(orgId)` / `listProjectsByTeam(orgId, teamId)` | Organization- and team-scoped project lists in project-name order. | Distribution, Governance, VCS Integration |
| `createProject`, `updateProject`, `deleteProject` | Project lifecycle operations; validate Identity references through Identity & Access read contracts and write `project.created` / `project.updated` / `project.deleted` audit events transactionally. | Distribution (route handlers) |
| `addProjectMember`, `listProjectMembers`, `removeProjectMember` | Project membership operations; same-organization users from any team may be members, duplicate `(projectId, userId)` grants are rejected, and member mutations are audited transactionally. | Distribution (route handlers) |
| `createPrompt`, `publishVersion`, `sharePrompt` | Future prompt write operations, org-scoped. | Distribution (route handlers) |

## Events Published

| Event | Payload summary | Consumers |
|---|---|---|
| `PromptCreated` / `PromptVersionPublished` | orgId, promptId, versionId, actorUserId | Audit |
| `PromptShared` | orgId, promptId, sharedWithUserId | Audit |
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

interface PromptSummary {
  id: string; orgId: string; name: string; description: string | null;
  isDeprecated: boolean; ownerUserId: string | null;
  latestVersion: { version: string; tags: string[] } | null;
}

interface Project {
  id: string; orgId: string; teamId: string; // owning team — every project belongs to exactly one team
  leadUserId: string | null; name: string; slug: string; description: string | null;
  createdAt: Date; updatedAt: Date;
}
interface ProjectMember {
  id: string; projectId: string; userId: string; role: string; createdAt: Date;
}
```

`name` and `slug` are unique **within an organization**, not globally — corrected from the current single-tenant schema. Project member uniqueness is persisted on `(project_id, user_id)`.

## Stability Guarantees

`expand()`'s output shape and the recursive-inclusion max depth (`MAX_INCLUDE_DEPTH`) are stable; increasing the depth limit is backward compatible, decreasing it is not.

## Breaking Change Policy

Changes to template syntax (Nunjucks tag set) or inclusion resolution order are called out in the PR description and, if they change existing prompt output, require a PDR.
