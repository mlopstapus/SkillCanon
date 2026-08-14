# Prompt Registry — Contract

**Owner:** Ben Anderson
**Status:** Draft

## Purpose

Owns `Project`, `Prompt` (a "skill"), `PromptVersion`, `Subscription`, `ProjectTeam`, `ProjectSkillAssignment`, and the expansion engine — the other core-domain context. Expansion renders a prompt version's content, weaves in Governance's effective policies/objectives, and resolves recursive prompt-inclusion references up to a max depth. This context calls Governance through its read contract only — it must never query `governance.*` tables directly, since that coupling is exactly what made the current Python `expand_prompt` hard to reason about.

A `PromptVersion` is one of two kinds ([PDR-017](../../../docs/pdr/017-fold-workflow-orchestration-into-prompt-registry.md)): a **template version** — a required main Markdown file (`SKILL.md`) plus zero or more named supporting files, resolved in a single `expand()` call ([PDR-018](../../../docs/pdr/018-skill-file-format-and-registry-import.md), 032-skill-file-format-refactor; every version published before that feature shipped keeps its original flat `systemTemplate`/`userTemplate` shape instead, read-only going forward — see that feature's data-model.md) — or a **chain version** (an ordered list of skill-step references, resolved across multiple caller-driven calls via `startSkillChainRun`/`advanceSkillChainRun`). There is no separate "Workflow" entity or bounded context — a chain is a skill whose version happens to be a step list instead of a template, and it inherits the same ownership, versioning, sharing, and project-assignment machinery every other skill gets for free. This absorbs what was previously the `workflow-orchestration` bounded context; that BC's `CONTRACT.md`/`OWNERSHIP.md` are superseded by this one.

A skill is owned by exactly one user or exactly one team, never derived from a project ([PDR-016](../../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)). Ownership, sharing (subscribe/fork), and project usage (assignment) are three independent concerns — a project draws only from the catalogs of the teams actually working on it, and never references a personal skill directly.

## Exposed APIs

| Endpoint / Method | Description | Consumers |
|---|---|---|
| `expand(db, { organizationId, promptName, userId?, projectId?, version? })` | Returns `{ content, appliedPolicies, objectives }` (021-expansion-engine; reshaped from `{ systemMessage, userMessage, ... }` and the `input` parameter dropped entirely by 032-skill-file-format-refactor/[PDR-018](../../../docs/pdr/018-skill-file-format-and-registry-import.md) — a skill is invoked, not called with arguments, for every caller including chain steps). Resolves a **template version** only — rejects (`ExpansionSourceNotFoundError`) a version that's a chain, same as any other unresolvable version. For a version published before 032-skill-file-format-refactor shipped (legacy-shape, no files), `content` is composed from its original `systemTemplate`/`userTemplate` rendering (`system ? (user ? system+"\n\n"+user : system) : user`) — resolved exactly as before, never auto-converted. Governance policies applied are always resolved from the *invoking user's* own team chain — never from the skill's owning team, even when the invoked skill is a subscribed/forked-in one owned elsewhere ([PDR-016](../../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)). `projectId` is forwarded only into objective resolution (Policy has no project scope at all under PDR-016). No `userId` given means fully ungoverned — zero policies, zero objectives, no fallback identity (there is no single-user "skill owner" to borrow once a skill can be team-owned). Nested `include_prompt('name')` references (template-invoked, never automatic) resolve up to `MAX_INCLUDE_DEPTH` (3) across either content shape; depth-exceeded or a not-found name both degrade to a plain inline placeholder string rather than throwing. A deprecated skill, or one with no published version, is rejected the same way a nonexistent one would be (`ExpansionSourceNotFoundError`), even when a specific still-existing version is explicitly requested. A pure read — no audit write. | Distribution (`sh-run`) |
| `startSkillChainRun(db, actor, promptName, version?)` ([PDR-017](../../../docs/pdr/017-fold-workflow-orchestration-into-prompt-registry.md), replaces `workflow-orchestration`'s planned `startWorkflowRun`) | Resolves a **chain version**'s step 1 — calls `expand()` internally (same-BC, never cross-BC), so per-step governance is unchanged. Authorization is the same accessible-skill set `listPrompts` computes (owner, own team, or subscription — including a subscribing project's membership); a caller without access gets the same `PromptNotFoundError` a nonexistent skill would. Dependency validation (no self/forward/nonexistent-step references, no duplicate step ids) runs once here, before any row is written. Returns `{ runId, step }`, or `{ runId, done: true }` immediately for a zero-step chain (026-skill-chains — refines this row's originally-undocumented zero-step return shape). A step-0 resolution failure (the target skill no longer available) throws `ChainStepResolutionFailedError` and leaves no run row at all — the whole call rolls back, exactly like an invalid-dependency rejection, never a partially-persisted "failed" run (transaction-model constraint, not a choice — see that feature's research.md). | Distribution (`sh-workflow-run`) |
| `advanceSkillChainRun(db, actor, runId, report)` | Records the caller's self-reported outcome (`stepIndex`, `success`/`error`, optional opaque `output` capped at 64 KB — an oversized value is rejected outright, never truncated) for the run's currently-pending step, then resolves and returns the next step or `{ done: true }`. `report.stepIndex` must name the actual current pending step — a stale/racing report naming a step the run has already moved past is rejected as `RunStepConflictError` (necessary because the row lock alone can't distinguish a legitimate new report from a duplicate of an already-processed one). A run already in a terminal state rejects with `RunAlreadyFinishedError`. Every step resolves its own content independently via `expand()` with no per-step arguments at all (032-skill-file-format-refactor dropped the prior `dependsOn` auto-substitution mechanism along with `expand()`'s `input` parameter generally) — a step reported `"error"` does **not** block a dependent downstream step from resolving; each prior step's caller-reported `output`/status stays visible to the *caller* via this function's return value and `getSkillChainRun`'s step list, and relaying it into a later step's own context (if needed) is the caller's responsibility, not this function's. Step resolution order is strictly the chain's step order, never a dependency-graph traversal. A later step's resolution failure rolls back the whole call (leaving the run retryable at its prior state), same reasoning as `startSkillChainRun`'s step-0 case. Any accessible org member may call this, not only the run's original starter. Neither this nor `startSkillChainRun` stores or returns anything resembling a model's actual response — only what was sent and what the caller self-reported. | Distribution (`sh-workflow-run`) |
| `abandonSkillChainRun(db, actor, runId, auditContext?)` (026-skill-chains — a 5th exposed function beyond this BC's original chain-run design; ending a run early isn't a variant of a step report) | Explicitly ends an in-progress run, transitioning it to `"abandoned"`. Same access-scoping, row-locking, and terminal-state rejection as `advanceSkillChainRun`. The pending step (if any) is left with no self-reported outcome permanently. | Distribution (`sh-workflow-run`) |
| `listSkillChainRuns(db, orgId, promptId, options?: { page?, pageSize? })` | Read-only, paginated (027-skill-chain-views-ui): returns `{ items: ChainRunSummary[]; page; pageSize; total }`, most-recent-`startedAt`-first — `items` carries run summaries only, no per-step detail. Each `ChainRunSummary` includes `version`, the chain version label the run executed. `page`/`pageSize` normalize the same way `audit-compliance`'s `listAuditEvents` does (default page size 20, max 100). No `expand()` call, no state transition. | Distribution (web UI's read-only run history page) |
| `getSkillChainRun(db, orgId, runId)` | Read-only: one run (including `version`, the chain version label it executed) plus its full per-step resolved content and self-reported outcome. No `expand()` call, no state transition — safe for a UI to poll or load repeatedly. Returns `null` for a nonexistent run id and for a cross-organization one alike — never a distinguishing error. | Distribution (web UI's read-only run history page) |
| `listPrompts(db, actor: { organizationId, userId }, { projectId? })` | The caller's *accessible* set (020-prompt-sharing, extended by 022-project-skill-assignment and 023-prompt-registry-views-ui): skills they own, skills their own team owns, skills they (or their team) subscribe to, skills subscribed to by any **project** they're a member of (new in 023-prompt-registry-views-ui), and — when `projectId` is given and the caller is a member of that project — every skill assigned to it regardless of which participating team contributed it. Resolves the caller's own `teamId` and project memberships internally via Identity & Access's `getUser` and this BC's own `project_members`. | Distribution (`sh-list`, `sh-search`, UI) |
| `listSkillsByOrganization(db, organizationId)` | The *discoverable* set (020-prompt-sharing, FR-019/FR-020): every skill in the organization, unfiltered by ownership/subscription/team membership — a direct passthrough to the existing org-wide repo query. Broader than `listPrompts`'s accessible set; governs visibility, not usability for invocation. | Distribution (`sh-list --all`, UI catalog browse) |
| `getPrompt(orgId, name)` | Latest version + metadata | Distribution |
| `getPromptById(orgId, promptId)` | Prompt metadata by id (vs. `getPrompt`'s by-name lookup); `null` for nonexistent or cross-organization ids (020-audit-log-ui) | Audit & Compliance (audit log UI resource-name resolution) |
| `getPromptVersion(orgId, versionId)` | One prompt version by id, org-scoped via a join through its owning prompt (`prompt_versions` has no `organization_id` column of its own); `null` for nonexistent or cross-organization ids (020-audit-log-ui) | Audit & Compliance (audit log UI resource-name resolution) |
| `getProject(orgId, projectId)` | Project metadata including its owning `teamId`; returns no row for nonexistent or cross-organization ids. | VCS Integration (repo↔project linking), Distribution |
| `listProjectsByOrganization(orgId)` / `listProjectsByTeam(orgId, teamId)` | Organization- and team-scoped project lists (by owner **or** collaborator team) in project-name order. | Distribution, VCS Integration |
| `createProject`, `updateProject`, `deleteProject` | Project lifecycle operations; validate Identity references through Identity & Access read contracts and write `project.created` / `project.updated` / `project.deleted` audit events transactionally. `updateProject`'s team-admin operations (add/remove collaborator team, rename, delete) are restricted to the project's **owner team**. | Distribution (route handlers) |
| `addProjectMember`, `listProjectMembers`, `removeProjectMember` | Project membership operations; same-organization users from any team may be members, duplicate `(projectId, userId)` grants are rejected, and member mutations are audited transactionally. | Distribution (route handlers) |
| `addCollaboratorTeam(db, actingUser: UserSummary, projectId, { teamId }, auditContext?)` / `removeCollaboratorTeam(db, actingUser: UserSummary, projectId, { teamId }, auditContext?)` | Owner-team-only operations managing a project's collaborator teams (022-project-skill-assignment, pulled forward from `001`); the owner team itself is not a row in `project_teams` — it's `projects.team_id`, never removable via this API (delete the project instead). `actingUser` is Identity & Access's exported `UserSummary` shape, checked via the same org-admin-or-team-owner rule `subscribeSkill`/`forkSkill` already use (`authorize-owner-action.ts`, reused not duplicated). Rejects a cross-org team, the owner team naming itself as a collaborator, and duplicates. | Distribution (route handlers) |
| `listProjectTeams(db, orgId, projectId)` | A project's current collaborator teams (excludes the owner team — see above). A pure, unauthenticated read. | Distribution (route handlers), VCS Integration |
| `addProjectRepo(db, actingUser: UserSummary, projectId, { name, url, branch? }, auditContext?)` / `removeProjectRepo(db, actingUser: UserSummary, projectId, repoId, auditContext?)` (023-prompt-registry-views-ui, new capability) | Links/unlinks a git repository to a project. Owner-team-admin-gated via the same rule as `addCollaboratorTeam`. Rejects a duplicate `(projectId, url)` pair. | Distribution (route handlers) |
| `listProjectRepos(db, orgId, projectId)` (023-prompt-registry-views-ui) | A project's linked repositories. A pure, unauthenticated read, org-scoped via the owning project row. | Distribution (route handlers) |
| `createPrompt`, `publishVersion` | Skill lifecycle, org-scoped. `createPrompt`'s owner is always the creating user (`ownerType: "user"`) — becoming team-owned only happens via `subscribeSkill`/`forkSkill` from a team; it creates only the skill shell, no version (a skill may exist with zero versions). `createPrompt` accepts an optional `sourceUrl` (013-skill-import-and-external-registries) — set only when the skill is being created via external import, `null` otherwise; never changes after creation. `publishVersion` accepts either `{ mainFile: { content }, supportingFiles? }` (a template version, 032-skill-file-format-refactor/[PDR-018](../../../docs/pdr/018-skill-file-format-and-registry-import.md) — `mainFile` is stored as the required `SKILL.md`; validation rejects an empty file, a file over 64 KB, a duplicate supporting-file name, or more than 20 supporting files, throwing `InvalidVersionFilesError`) or `{ steps }` (a chain version, [PDR-017](../../../docs/pdr/017-fold-workflow-orchestration-into-prompt-registry.md)) — never both; a version's files, like a chain's steps, are immutable once published, so editing means publishing a new version. No new version may be published in the pre-032 flat `systemTemplate`/`userTemplate` shape — that shape is read-only, carried only by versions published before this feature shipped. | Distribution (route handlers) |
| `fetchExternalSkillSource(source)` (013-skill-import-and-external-registries, spec 036-external-skill-import) | Pure external read — no `db` parameter, no audit write, since nothing is persisted yet. Fetches a public GitHub repository (`owner/repo`, a github.com URL, or GitHub's own `/tree/<branch>/<path>` shape — GitHub only, per FR-013) and returns every skill folder found there (`SKILL.md` directly at the given path; a `skills/` or nested `.claude/skills/` directory of per-skill subfolders — the latter being the standard Claude Code skills location; or, failing both, every top-level subdirectory containing its own `SKILL.md`, additionally recursing one level into a subdirectory that doesn't, i.e. a category folder), each with full main-file and supporting-file content ready to hand straight to `createPrompt`/`publishVersion` — no second fetch needed at import time. Never requires the caller to own or have write access to the source (FR-006). Throws `InvalidExternalSourceError` for a malformed/non-GitHub source, `ExternalSourceNotFoundError` when the source is reachable but nothing importable is found there, `ExternalSourceUnreachableError` for a private/deleted repo or network/rate-limit failure. Name-collision handling is not this function's job — importing the returned candidates still goes through `createPrompt`'s existing `DuplicatePromptNameError`, same as any other skill creation. | Distribution (route handlers) |
| `deprecatePrompt(db, actor: PromptActor, promptName, auditContext?)` / `reactivatePrompt(db, actor: PromptActor, promptName, auditContext?)` (023-prompt-registry-views-ui) | Toggle a prompt's `isDeprecated` flag. Both are now audited (`prompt.deprecated`/`prompt.reactivated`) — `deprecatePrompt` previously performed this mutation with no audit write at all, a gap closed once this feature became its first real caller. | Distribution (route handlers) |
| `subscribeSkill(db, actingUser: UserSummary, sourceSkillId, { subscriberType, subscriberId }, auditContext?)` | Creates a live reference: the subscriber (a user, a team, or — new in 023-prompt-registry-views-ui — a project) always resolves the source's *current* active version. A project-level subscription extends access to every member of that project (resolved the same way `listPrompts`'s accessible-set already resolves user/team subscriptions). Revocable by the subscriber or (if `subscriberType: "team"`) an admin/owner of that team, or (if `subscriberType: "project"`) an admin/owner of that project's owner team. Rejects self-subscription, duplicates, and any subscriber outside `actingUser`'s own organization. Authorization is always about the *subscriber* side, never the source skill's owner — any org member with authority over the chosen subscriber may create the grant, matching every other team/project-administration rule in this system (023-prompt-registry-views-ui's `spec.md` Assumptions has the full reasoning). `actingUser` is Identity & Access's exported `UserSummary` shape (`{ id, orgId, teamId, role, email }`), not this BC's narrower `PromptActor` — needed for the org-admin-or-team-owner authorization check. | Distribution (route handlers) |
| `unsubscribeSkill(db, actingUser: UserSummary, subscriptionId, auditContext?)` | Removes a subscription. Does not affect the source skill or any other subscriber. A nonexistent subscription and one the caller has no authority over are both rejected (distinct error types; see `domain/subscription.ts`). | Distribution (route handlers) |
| `listSubscriptionsForSkill(db, orgId, sourceSkillId)` (023-prompt-registry-views-ui) | Every subscription grant on a skill, regardless of subscriber kind. A pure, unauthenticated read powering the Share drawer's "who already has access" state. | Distribution (route handlers) |
| `forkSkill(db, actingUser: UserSummary, sourceSkillId, { ownerType, ownerId }, auditContext?)` | Creates an independent copy of the source's current active version under a new owner (a user or a team), stamped with `forkedFromSkillId` pointing back at the source for lineage/audit. The fork never syncs further — it's a new `Prompt` row from that point on. Rejects forking into an owner that already owns the source (FR-021). | Distribution (route handlers) |
| `assignSkillToProject(db, actingUser: UserSummary, projectId, skillId, { requirement: "required" \| "optional" }, auditContext?)` | Assigns a skill to a project. Rejected unless `skillId`'s owner is one of the project's participating teams (owner or collaborator) — a personal skill (`ownerType: "user"`) is rejected unconditionally, even for its own owner; it must be subscribed/forked into a team first. `actingUser` checked via the same owner-team-admin rule as `addCollaboratorTeam`. Unaffected by the skill's own later lifecycle changes (e.g. deprecation). | Distribution (route handlers) |
| `unassignSkillFromProject(db, actingUser: UserSummary, projectId, skillId, auditContext?)` | Removes an assignment. Rejects an unassign for a skill not currently assigned, with no side effects. | Distribution (route handlers) |
| `listRequiredSkillsForProject(db, orgId, projectId)` | Flat list of skill names assigned to the project with `requirement: "required"`. No team-chain resolution or actor parameter involved — this is a direct catalog read, not a Governance concern ([PDR-016](../../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)). | VCS Integration (PR evaluation) |
| `listProjectSkillAssignmentsForOrganization(db, orgId)` (023-prompt-registry-views-ui) | Every project-skill assignment in the organization, flat — the reverse index of `listByProject` (per-skill, not per-project). A pure, unauthenticated read, powering the Prompts list page's "which project(s) is this in" column. | Distribution (route handlers) |
| `getProjectMetrics(db, orgId, projectId)` (024-project-usage-metrics-dashboard) | Composes Distribution's `getPromptUsageSummaryForProject` with this BC's own project members/skill assignments into the Project Detail Metrics tab's full data: total invocations (all-time), active skills/contributors (rolling 30-day), a skill-level required-skill coverage ratio, a member-level gap list (independent of the coverage ratio — see that feature's research.md), a 14-day per-skill trend, and all-time by-skill/by-member breakdowns. A pure, unauthenticated read. | Distribution (route handlers) |

## Events Published

| Event | Payload summary | Consumers |
|---|---|---|
| `PromptCreated` / `PromptVersionPublished` | orgId, promptId, versionId, actorUserId | Audit |
| `PromptDeprecated` / `PromptReactivated` / `PromptVersionActivated` (023-prompt-registry-views-ui) | orgId, promptId, actorUserId | Audit |
| `ProjectRepoAdded` / `ProjectRepoRemoved` (023-prompt-registry-views-ui) | orgId, projectId, repoId, actorUserId | Audit |
| `SkillSubscribed` / `SkillUnsubscribed` | orgId, sourceSkillId, subscriberType, subscriberId, actorUserId | Audit |
| `SkillForked` | orgId, sourceSkillId, forkedSkillId, ownerType, ownerId, actorUserId | Audit |
| `ProjectSkillAssigned` / `ProjectSkillUnassigned` | orgId, projectId, skillId, requirement, actorUserId | Audit |
| `PromptExpanded` | orgId, promptId, versionId, callerUserId, appliedPolicyIds | Distribution (writes `PromptUsage`), Audit |
| `SkillChainRunCompleted` / `SkillChainRunFailed` / `SkillChainRunAbandoned` (replaces `workflow-orchestration`'s planned `WorkflowRunCompleted`/`WorkflowRunFailed`; `Abandoned` added during 026-skill-chains implementation as a third, more precise action than conflating an explicit early-end with a failure) | orgId, promptId, runId, step count/status summary (self-reported, not a model output) | Audit — **not yet Distribution (usage metrics)**: `distribution.recordPromptUsage` has no live caller anywhere in this codebase yet, not even from `expand()`'s own ordinary invocations (024-project-usage-metrics-dashboard's own FR-002a decision) — wiring chain-run completion into it here would be premature; tracked at `backlog/008-distribution/004-usage-telemetry.md` |

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

// A chain step and its resolution/report shapes (PDR-017) — same contract
// workflow-orchestration's 002-workflow-runner spec defined, re-homed here.
interface SkillChainStep {
  id: string; promptName: string; promptVersion?: string; dependsOn: string[];
}
interface SkillChainStepResolution {
  stepId: string; stepIndex: number; promptName: string; promptVersion: string;
  systemMessage: string | null; userMessage: string;
}
// `stepIndex` added during 026-skill-chains implementation — required so
// advanceSkillChainRun can detect a stale/racing report for a step the run
// has already moved past (FR-007a); not in the shape originally speced.
interface SkillChainStepReport {
  stepIndex: number; status: "success" | "error"; output?: string; error?: string;
}
// Either a resolved step or `{ done: true }` for a run with no more steps
// (or a zero-step chain) — the originally-speced shape didn't spell out
// this union explicitly.
type StartSkillChainRunResult =
  | { runId: string; step: SkillChainStepResolution }
  | { runId: string; done: true };
type AdvanceSkillChainRunResult = { step: SkillChainStepResolution } | { done: true };

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

`expand()`'s output shape (`{ content, appliedPolicies, objectives }` since 032-skill-file-format-refactor) and the recursive-inclusion max depth (`MAX_INCLUDE_DEPTH`) are stable; increasing the depth limit is backward compatible, decreasing it is not. A skill's `ownerType`/`ownerId` never changes in place — a skill that should have a different owner is forked (a new row, new owner, `forkedFromSkillId` lineage), not reassigned. A chain version's step resolution order is strictly sequential by step position, never dependency-graph order; every step resolves its own content independently with no per-step arguments (032-skill-file-format-refactor) — this is user-visible behavior IDEs build around and changing it requires a PDR, same as the equivalent guarantee `007-workflow-orchestration`'s `CONTRACT.md` previously stated.

## Breaking Change Policy

Changes to template syntax (Nunjucks tag set) or inclusion resolution order are called out in the PR description and, if they change existing prompt output, require a PDR. Changes to what "assigned to a project" or "subscribed to" mean for access/visibility purposes require a PDR — see [PDR-016](../../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)'s access-model reasoning. Changes to how a failed chain step affects downstream steps require a PDR.
