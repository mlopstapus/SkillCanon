# Contract: Prompt Registry Views UI

No external (customer-facing) HTTP API — server-rendered pages plus Next.js Server Actions. Contracts here are (a) the route/access-control surface, (b) the server-action surface, and (c) the `src/bcs/prompt-registry` `CONTRACT.md` additions this feature requires.

## Access control contract

- **Routes**: `/prompts`, `/prompts/new` (drawer state, not a route — see research.md), `/prompts/[name]`, `/projects`, `/projects/[id]`.
- **Requirement**: Any authenticated, entitled member of the organization may view these pages — no admin-only gate (unlike `/settings/audit-log`). Mutating actions are individually authorized at the application layer (existing `assertAuthorizedForOwner` rule for owner/subscriber-acting operations; `ProjectActor`-scoped org/user validation for project CRUD/membership) — the UI hides or disables a control it knows the caller isn't authorized for, but the server action re-checks independently regardless (never trust hidden-UI-as-authorization).
- **Enforcement point**: Authentication + entitlement gating is already enforced one layer up, in `(app)/layout.tsx` via `resolveAppShellAccess()` — no new gate is added by this feature. Every mutating server action independently calls `authenticateSession()` (matching `teams/actions.ts`'s `requireActingUser()` pattern) before invoking any `prompt-registry` function, since a server action is a distinct entry point from the page render.

## Server action surface

`src/app/(app)/prompts/actions.ts`:

| Action | Wraps |
|---|---|
| `createPromptAction(params)` | `createPrompt` |
| `publishVersionAction(promptName, params)` | `publishVersion` |
| `rollbackPromptAction(promptName, version)` | `rollbackPrompt` (now audited) |
| `deprecatePromptAction(promptName)` | `deprecatePrompt` (now audited) |
| `reactivatePromptAction(promptName)` | `reactivatePrompt` (new) |
| `subscribeSkillAction(sourceSkillId, params)` | `subscribeSkill` (params.subscriberType may be `"project"`) |
| `unsubscribeSkillAction(subscriptionId)` | `unsubscribeSkill` |
| `forkSkillAction(sourceSkillId, params)` | `forkSkill` |
| `assignSkillToProjectAction(projectId, skillId, requirement)` | `assignSkillToProject` |
| `unassignSkillFromProjectAction(projectId, skillId)` | `unassignSkillFromProject` |

`src/app/(app)/projects/actions.ts`:

| Action | Wraps |
|---|---|
| `createProjectAction(params)` | `createProject` (+ new `project-identity-verifier.ts`) |
| `updateProjectAction(projectId, fields)` | `updateProject` |
| `addProjectMemberAction(projectId, userId, role?)` | `addProjectMember` |
| `removeProjectMemberAction(projectId, userId)` | `removeProjectMember` |
| `addCollaboratorTeamAction(projectId, teamId)` | `addCollaboratorTeam` |
| `removeCollaboratorTeamAction(projectId, teamId)` | `removeCollaboratorTeam` |
| `addProjectRepoAction(projectId, params)` | `addProjectRepo` (new) |
| `removeProjectRepoAction(projectId, repoId)` | `removeProjectRepo` (new) |

Every action: `revalidatePath()`s its page on success, returns `{ ok: true }` / `{ ok: false; error: string }` — matching `teams/actions.ts`'s established `TeamActionResult` shape exactly (a new equivalent `PromptActionResult`/`ProjectActionResult` type per route folder).

## `src/bcs/prompt-registry/CONTRACT.md` additions

New rows for the "Exposed APIs" table:

- `reactivatePrompt(db, actor: PromptActor, promptName)` — inverse of `deprecatePrompt`; sets `isDeprecated: false`; audited (`prompt.reactivated`). | Distribution (route handlers)
- `addProjectRepo(db, actingUser: UserSummary, projectId, { name, url, branch? }, auditContext?)` / `removeProjectRepo(db, actingUser: UserSummary, projectId, repoId, auditContext?)` — owner-team-admin-gated, same rule as `addCollaboratorTeam`. Rejects a duplicate `(projectId, url)`. | Distribution (route handlers)
- `listProjectRepos(db, orgId, projectId)` — pure read, org-scoped via parent project. | Distribution (route handlers)

Updated rows:

- `subscribeSkill`'s `params.subscriberType` is now `"user" | "team" | "project"` — a project-level grant makes the prompt accessible to every current and future member of that project (resolved via the accessible-set query's new project-subscription branch), authorized the same way as `addCollaboratorTeam` (project's owner-team admin/owner, or an org admin).
- `deprecatePrompt` / `rollbackPrompt` — now audited (`prompt.deprecated` / `prompt.version_activated`); previously silent, a gap this feature closes since it's their first real caller.

New row for "Events Published":

- `PromptDeprecated` / `PromptReactivated` / `PromptVersionActivated` — orgId, promptId, actorUserId | Audit
- `ProjectRepoAdded` / `ProjectRepoRemoved` — orgId, projectId, repoId, actorUserId | Audit

## Redaction / rendering contract (inherited, not modified)

The Prompt Detail "Preview" tab (FR-009) renders `expand()`'s existing output verbatim — this feature never constructs its own template renderer or bypasses the sandboxed Nunjucks environment. No new redaction concern: templates and their rendered output are not secrets.
