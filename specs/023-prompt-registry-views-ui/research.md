# Phase 0 Research: Prompt Registry Views UI

No `NEEDS CLARIFICATION` markers remained in Technical Context — every field was resolved by reading the existing codebase. This document records the investigative decisions that shaped `plan.md`, since almost all of them came from discovering how much of this feature's backend already exists (and in what shape) rather than from the spec text alone.

## Decision: Almost everything this UI needs already exists — this is a wiring feature, not a backend-build feature

**Decision**: Treat `src/bcs/prompt-registry`'s existing application layer as substantially complete for this feature's scope. Grepping every file in `application/` against the spec's FRs found a working, tested function for nearly every requirement: `listPrompts`/`listSkillsByOrganization`/`getPrompt`/`createPrompt`/`publishVersion`/`rollbackPrompt` (= "set active version", FR-014)/`deprecatePrompt` (FR-010a's deprecate half)/`subscribeSkill`/`unsubscribeSkill`/`forkSkill` (FR-015/016)/`createProject`/`updateProject`/`getProject`/`listProjectsByOrganization`/`listProjectsByTeam`/`addProjectMember`/`listProjectMembers`/`removeProjectMember` (FR-023)/`addCollaboratorTeam`/`removeCollaboratorTeam`/`listProjectTeams` (FR-022)/`assignSkillToProject`/`unassignSkillFromProject`/`listRequiredSkillsForProject` (FR-024/025).

**Rationale**: None of these functions has a real route/server-action caller yet (confirmed by grepping `src/app` for each function name — zero hits outside this BC's own tests and test-helpers). `019`/`020`/`022`'s features built and fully tested the domain/application logic but explicitly deferred UI wiring to this feature (matches this repo's established "identity-access epic features build the layer, not the route" precedent noted in `CLAUDE.md`). This feature's job for these FRs is therefore server actions + pages that call already-correct, already-tested functions — not new business logic.

**Alternatives considered**: Re-deriving simplified versions of this logic directly in route handlers — rejected outright; would duplicate real, tested domain logic and violate D1.

## Decision: Project-level sharing reuses the existing owner-team-admin authorization rule, not a new one

**Decision**: Widen `subscriptions.subscriberType` (and the `SubscriberType` domain type) from `"user" | "team"` to `"user" | "team" | "project"`. Add one new branch to the existing shared `assertAuthorizedForOwner(tx, actingUser, ownerType, ownerId)` helper (already called by `subscribeSkill`, `unsubscribeSkill`, `forkSkill`, `addCollaboratorTeam`, `assignSkillToProject`): when `ownerType === "project"`, resolve the project via the sibling `getProject()` function, then recurse into the existing `"team"` branch on `project.teamId`. No other authorization code is added.

**Rationale**: The spec's Clarifications already decided *what* a project-level grant means (a subscription, same as a team's). This decision is the *who can create one* question, which the spec left to planning. Reusing the exact rule `addCollaboratorTeam`/`assignSkillToProject` already use for "who administers this project" (org admin, or the project's owner team's own admin/owner) is the smallest, most consistent choice — it's the same authority level this codebase already requires for every other project-configuration action, and it required a one-branch addition to an existing, already-tested helper rather than a new authorization concept. `unsubscribeSkill` needed no code change at all — it already calls `assertAuthorizedForOwner` generically with whatever `subscriberType` the stored subscription has, so the new "project" branch takes effect there automatically.

**Alternatives considered**:
- *A separate `assertAuthorizedForSubscriber` wrapper function, delegating to `assertAuthorizedForOwner` for user/team and handling "project" itself*: rejected — both existing callers (`subscribeSkill`, `unsubscribeSkill`) already call `assertAuthorizedForOwner` directly; introducing a parallel function would mean migrating both call sites for no behavioral difference, versus a one-branch addition to the function they already call.
- *Authorize via the project's `leadUserId` instead of (or in addition to) its owner team*: rejected — no other project-configuration action in this codebase treats the lead specially for authorization (`addCollaboratorTeam`/`assignSkillToProject` both gate on the owner team only); introducing a second authorized-party concept here would be inconsistent with the rest of the BC for no requirement asking for it.
- *A brand-new `project_subscriptions` table instead of widening `subscriptions`*: rejected — the spec's Clarification explicitly chose "resolved the same way team subscriptions already are," and the existing table's `subscriber_type`/`subscriber_id` pair is already polymorphic by design (no FK, opaque id) specifically to support exactly this kind of extension.

## Decision: No migration needed to widen `subscriptions.subscriberType`

**Decision**: Change only the TypeScript enum literal in `schema.ts` (`text("subscriber_type", { enum: ["user", "team"] })` → `[...， "project"]`) and `domain/subscription.ts`'s `SubscriberType` union. No `drizzle-kit generate` run, no new migration file.

**Rationale**: Reading `drizzle/migrations/0017_prompt_registry_subscriptions.sql` directly shows `subscriber_type` is a plain `text NOT NULL` column with no `CHECK` constraint — Drizzle's `{ enum: [...] }` option only narrows the TypeScript type at the query-builder level; it has no runtime/DB-level enforcement for a `text` column (unlike a real Postgres `enum` type, which this column is not). A new value is therefore already valid at the database layer today.

**Alternatives considered**: Adding a `CHECK` constraint enforcing the three-value enum going forward — considered, but rejected as out of scope: no other `text`-as-enum column in this bounded context (`prompts.ownerType`, `projectSkillAssignments.requirement`) has a DB-level `CHECK` either, so adding one here would be a new, unprecedented pattern for this codebase, not a fix to a regression this feature introduces.

## Decision: `project_repos` is a brand-new table, modeled directly on `project_teams`

**Decision**: Add `prompt_registry.project_repos` (`id`, `project_id` FK cascade, `name`, `url`, `branch` default `'main'`, `created_at`), unique on `(project_id, url)`, RLS enabled via the same join-through-parent-project pattern `project_teams` already uses (no `organization_id` column of its own). New `application/add-project-repo.ts` / `remove-project-repo.ts` / `list-project-repos.ts`, modeled line-for-line on `add-collaborator-team.ts` / `remove-collaborator-team.ts` / `list-project-teams.ts` — same owner-team-admin authorization (`assertAuthorizedForOwner(db, actingUser, "team", project.teamId)`), same audited-mutation shape.

**Rationale**: No prior feature or PDR modeled linking a git repository to a project — this is genuinely new capability the mockup calls for (FR-026) with no existing analog beyond the structurally-identical `project_teams` table, which is the closest precedent for "a project's has-many sub-resource with owner-team-gated add/remove." RLS is added in the *same* migration that creates the table, per this feature's own Constitution Check (Principle IV) — never deferred to a later tenant-isolation feature, unlike this BC's historical pattern (RLS for `prompts`/`subscriptions`/etc. was deferred to a dedicated later feature; this repo has since closed that gap and a *new* table should not reopen it).

**Alternatives considered**: Storing repos as a JSONB array column on `projects` itself — rejected; every other has-many relationship in this BC (members, collaborator teams, skill assignments) is its own table with its own RLS policy, and a JSONB array would need to reinvent uniqueness/RLS-equivalent scoping that a real table gets for free.

## Decision: Fix `deprecatePrompt` and `rollbackPrompt`'s missing audit calls as part of this feature

**Decision**: Add the standard `withAudit(db, mutationFn, auditWriteFn)` wrapper (with a client-generated `randomUUID()`-based approach where an id is needed) to both `deprecatePrompt` (`prompt.deprecated`) and `rollbackPrompt` (`prompt.version_activated`), matching every sibling mutation in this bounded context.

**Rationale**: Reading both files found neither calls `withAudit`/`record()` at all — confirmed against `CONTRACT.md`'s own "Events Published" table, which lists `PromptCreated`/`PromptVersionPublished`/`SkillSubscribed`/etc. but nothing for deprecation or rollback. This is a real Constitution Principle VI gap ("every mutation... MUST be captured in an audit log"), not a hypothetical one — and it was low-stakes only because neither function has ever had a real caller before. This feature is the first real UI surface to call either (the Prompt Detail page's deprecate/reactivate and version-history "Set active" controls), so shipping them still-unaudited would mean *knowingly* introducing a production audit gap into a page whose whole purpose is transparent, auditable prompt governance. The fix is small (both functions already follow the exact same `find → mutate` shape every audited sibling does) and directly required by the constitution this feature must pass its own gate check against.

**Alternatives considered**: File the gap as a separate backlog item and ship this feature without fixing it — rejected; unlike the Metrics-dashboard deferral (which needed genuinely new infrastructure this feature has no reason to introduce), this fix is a few lines matching an established pattern already used by every neighboring function, and shipping a *new* real caller of a known-unaudited mutation function is a worse outcome than the small fix.

## Decision: Extending the accessible-prompts query for project subscriptions needs one new repo query

**Decision**: Add `listProjectIdsForUser(db, userId)` to `project-members-repo.ts` (a simple `project_members` scan by `userId`, returning project ids). `listPrompts` (application layer) calls it once per invocation and passes the resulting id list into an extended `listAccessibleByOwnerAndSubscriptions(tx, organizationId, userId, userTeamId, userProjectIds)`, which adds one more `or()` branch: `and(eq(subscriptions.subscriberType, "project"), inArray(subscriptions.subscriberId, userProjectIds))`.

**Rationale**: `listAccessibleByOwnerAndSubscriptions`'s existing shape already branches on "owner conditions" and "subscriber conditions" per subscriber kind (user, then conditionally team) — adding a third, conditional-on-non-empty-list branch for project ids follows the exact same shape with no structural change. No existing repo function returns "every project a user is a member of" (the existing project-membership queries are all scoped by a *specific* project, e.g. `findByProjectAndUser`), so this one new query is genuinely required, not a duplicate.

**Alternatives considered**: Resolving project membership inside `prompts-repo.ts` via a subquery joining `project_members` directly, instead of a separate repo call — rejected; `prompts-repo.ts` has no existing reason to know about the `project_members` table's shape, and a straightforward two-query approach (fetch project ids, then filter) is simpler to test in isolation and consistent with how `listPrompts` already composes `findByProjectAndUser` from a different repo file for its `projectId` option.

## Decision: First real `ProjectIdentityVerifier`/route-actor wiring

**Decision**: Build one concrete `ProjectIdentityVerifier` implementation in `src/app/(app)/projects/project-identity-verifier.ts`, composing `identity-access`'s already-exported `getOrganization`/`getTeam`/`getUser` (each throws on not-found; the verifier wraps each in try/catch to return a boolean, per the interface's contract).

**Rationale**: No real (non-test) implementation of `ProjectIdentityVerifier` exists anywhere in the codebase today — `createProject`/`updateProject`/`addProjectMember` have only ever been called from this BC's own tests via ad hoc test-helper verifiers. This feature is the first production consumer, so the verifier has to be built from scratch; composing already-exported single-purpose getters (rather than adding new identity-access surface) keeps this a route-layer wiring concern, not new cross-BC domain logic (D1).

**Alternatives considered**: Exporting a ready-made `ProjectIdentityVerifier` implementation from `identity-access` itself — rejected; the verifier's shape is `prompt-registry`'s own interface, defined for its own domain needs, and `identity-access` has no reason to know that interface exists (D1 — a BC exposes primitives, not adapters for another BC's internal interfaces).

## Decision: Server/client component split and filter-state persistence

**Decision**: Follow the exact pattern already established by `settings/audit-log` and `teams`: an async server `page.tsx` does the initial data fetch (auth is already handled one layer up by `(app)/layout.tsx`'s `resolveAppShellAccess()`), and hands data to a client component split into a pure `*View` (props in, no router-context hooks) and a thin wrapper owning `useRouter`/`useSearchParams`. Prompt-list search/filter state lives in the URL query string, debounced (~300-400ms) before triggering navigation, per this repo's documented per-keystroke-navigation-race gotcha (`020-audit-log-ui`'s search box).

**Rationale**: Established, working, twice-precedented convention; deviating would be inconsistent for no benefit, and the debounce requirement is a documented, previously-hit bug in this exact class of UI (URL-query-driven list filter).

**Alternatives considered**: Component-local-only filter state (no URL persistence) — rejected as a strictly worse default matching the same reasoning `020-audit-log-ui` already used; a filtered prompt list is exactly the kind of view worth bookmarking/sharing.

## Decision: New-version and share/assign drawers are page-level UI state, not separate routes

**Decision**: Despite the backlog's original page inventory naming `prompts/[name]/new-version` as if it were its own route, implement it (and every other drawer: version history, share, assign-to-projects, add-team, add-member, add-repo) as client-side open/closed state on the parent page, matching the mockup's own `sc-if`-gated drawer pattern exactly (`newVersionOpen`, `shareDrawerOpen`, etc. are all booleans in one component's state, never a route change).

**Rationale**: The mockup — the actual design source of truth this feature ports — never navigates to a distinct URL for any of these; every one is a slide-in drawer over the current page. Treating `new-version` as a literal Next.js route would invent navigation behavior the design never specifies and complicate state (the draft template fields would need to survive a route transition for no benefit). This matches `019-account-team-settings-ui`'s and `020-audit-log-ui`'s own established drawer-over-page-state pattern for this exact kind of "create/edit" UI.

**Alternatives considered**: A dedicated `/prompts/[name]/new-version` page — rejected; no acceptance scenario requires deep-linking directly into an in-progress "publish a version" form, and the mockup gives no reason to build one.
