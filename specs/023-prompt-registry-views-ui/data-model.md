# Phase 1 Data Model: Prompt Registry Views UI

Most entities this feature renders already exist, unchanged, in `src/bcs/prompt-registry/domain/`. This document covers only what's new or changed, plus the view-model shapes the UI itself introduces.

## Existing entities (read-only reference, unchanged)

```ts
// domain/prompt.ts
type PromptOwnerType = "user" | "team";
interface Prompt {
  id: string; organizationId: string; name: string; description: string | null;
  isDeprecated: boolean; activeVersionId: string | null;
  ownerType: PromptOwnerType; ownerId: string;
  forkedFromSkillId: string | null;
}
interface PromptVersion {
  id: string; promptId: string; version: string;
  systemTemplate: string | null; userTemplate: string | null;
  inputSchema: Record<string, unknown>; tags: string[]; createdAt: Date;
}

// domain/project.ts — ProjectSummary, ProjectMemberSummary (see CONTRACT.md, unchanged)

// domain/project-team.ts — ProjectTeam (project_id, team_id) — unchanged

// domain/project-skill-assignment.ts — ProjectSkillAssignment (project_id, skill_id, requirement) — unchanged
```

## Changed: `SubscriberType` widened

```ts
// domain/subscription.ts
export type OwnerType = PromptOwnerType;              // "user" | "team" — UNCHANGED (fork/prompt ownership never includes "project")
export type SubscriberType = PromptOwnerType | "project"; // NEW UNION — was an alias of OwnerType; now its own type

export interface Subscription {
  id: string; organizationId: string; sourceSkillId: string;
  subscriberType: SubscriberType; subscriberId: string; createdAt: Date;
}
export interface SubscribeSkillParams {
  subscriberType: SubscriberType;   // was OwnerType — now accepts "project"
  subscriberId: string;
}
// ForkSkillParams.ownerType stays OwnerType — forking into a project is not a thing (PDR-016)
```

No new error types needed: `CannotSubscribeToOwnSkillError`'s existing check (`source.ownerType === params.subscriberType && ...`) naturally never fires for `subscriberType: "project"`, since `ownerType` is never `"project"`.

## New: `ProjectRepo`

```ts
// domain/project-repo.ts (new file)
export interface ProjectRepo {
  id: string;
  projectId: string;
  name: string;
  url: string;
  branch: string;       // defaults "main"
  createdAt: Date;
}

export interface AddProjectRepoParams {
  name: string;
  url: string;
  branch?: string;       // defaults "main" if omitted
}

export class ProjectRepoNotFoundError extends Error {
  constructor(projectId: string, repoId: string) {
    super(`No repository found with id "${repoId}" on project "${projectId}".`);
    this.name = "ProjectRepoNotFoundError";
  }
}

export class DuplicateProjectRepoError extends Error {
  constructor(url: string) {
    super(`Repository "${url}" is already linked to this project.`);
    this.name = "DuplicateProjectRepoError";
  }
}
```

### Schema (`infrastructure/schema.ts` addition)

```ts
export const projectRepos = promptRegistrySchema.table(
  "project_repos",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    branch: text("branch").notNull().default("main"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("project_repos_project_id_url_unique").on(table.projectId, table.url),
    index("project_repos_project_id_index").on(table.projectId),
  ],
);
```

No `organizationId` column — tenancy resolved indirectly through `projects`, matching `project_teams`'s existing shape exactly. RLS policy (new migration): `ENABLE`/`FORCE ROW LEVEL SECURITY`, `USING`/`WITH CHECK` an `EXISTS` subquery joining `prompt_registry.projects` on `projects.id = project_repos.project_id AND projects.organization_id = current_setting('app.current_org_id')::uuid` — copy of `project_teams_tenant_isolation`'s policy shape from `0019_prompt_registry_rls.sql`.

## New application-layer functions

| Function | Shape | Modeled on |
|---|---|---|
| `reactivatePrompt(db, actor: PromptActor, promptName)` | Finds prompt by org+name, `updatePrompt(id, { isDeprecated: false })`, now audited (`prompt.reactivated`) | `deprecate-prompt.ts` (mirrored, inverse boolean) |
| `addProjectRepo(db, actingUser: UserSummary, projectId, params: AddProjectRepoParams, auditContext?)` | Loads project, `assertAuthorizedForOwner(db, actingUser, "team", project.teamId)`, rejects duplicate `(projectId, url)`, inserts + audits (`project_repo.added`) | `add-collaborator-team.ts` |
| `removeProjectRepo(db, actingUser: UserSummary, projectId, repoId, auditContext?)` | Loads project, same authorization, rejects not-found repo, deletes + audits (`project_repo.removed`) | `remove-collaborator-team.ts` |
| `listProjectRepos(db, orgId, projectId)` | Pure read, org-scoped via parent project | `list-project-teams.ts` |

## Changed application-layer functions

| Function | Change |
|---|---|
| `deprecatePrompt` | Adds `withAudit`/`record()` (`prompt.deprecated`) — previously silent |
| `rollbackPrompt` | Adds `withAudit`/`record()` (`prompt.version_activated`) — previously silent |
| `assertAuthorizedForOwner` | New `ownerType === "project"` branch: resolves via sibling `getProject()`, delegates to the existing `"team"` branch on `project.teamId`; throws `CrossOrgSubscriberError` if `getProject` returns `null` |
| `listPrompts` / `listAccessibleByOwnerAndSubscriptions` | Accessible-set query gains a third subscriber-kind branch: prompts subscribed-to by any project the caller is a member of (resolved via new `listProjectIdsForUser`) |

## New infrastructure query

```ts
// infrastructure/project-members-repo.ts addition
export async function listProjectIdsForUser(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx.select({ projectId: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, userId));
  return rows.map((r) => r.projectId);
}
```

## View-model shapes (UI layer only, not persisted)

```ts
// prompts list row
interface PromptListRow {
  id: string; name: string; description: string; isDeprecated: boolean;
  projectLabels: string[];   // projects this prompt is required/optional/subscribed-into, for the list's "Project" column
  ownerLabel: string; ownerInitial: string;
  activeVersion: string | null; tags: string[]; updatedAt: string;
}

// prompt detail
interface PromptDetailViewModel {
  prompt: Prompt; ownerLabel: string;
  activeVersion: PromptVersion | null;
  versions: PromptVersion[];          // full history, newest first
  expansion: { systemMessage: string | null; userMessage: string; appliedPolicies: string[] } | null; // from expand(), Preview tab
  shareState: {
    users: Array<{ id: string; name: string; granted: boolean }>;
    teams: Array<{ id: string; name: string; subscribers: number; copies: number }>;  // subscribers/copies are counts derived by querying subscriptions/forks per team, not stored fields
    projects: Array<{ id: string; name: string; granted: boolean }>;
  };
  projectAssignment: Array<{ projectId: string; projectName: string; requirement: "required" | "optional" | null }>;
}

// project detail (Metrics tab intentionally omitted — see spec.md Assumptions)
interface ProjectDetailViewModel {
  project: ProjectSummary; leadLabel: string | null;
  members: ProjectMemberSummary[];
  teams: ProjectTeam[];         // collaborator teams only, owner team shown separately via project.teamId
  repos: ProjectRepo[];
  requiredPrompts: PromptListRow[]; optionalPrompts: PromptListRow[]; availablePrompts: PromptListRow[]; // partition of listSkillsByOrganization by promptStatus, restricted to prompts owned by a participating team
}
```

`shareState.teams[].subscribers`/`.copies` are computed, not stored: "subscribers" = count of `subscriptions` rows for `(sourceSkillId, subscriberType: "team", subscriberId: teamId)` collapsed to 0-or-1 per team plus a separate per-user count if individual user grants are also shown; "copies" = count of `prompts` rows where `forkedFromSkillId = sourceSkillId` and `ownerType/ownerId` resolves to that team. This mirrors the mockup's displayed counts but is computed from real rows, not a stored counter column.
