# Phase 0 Research: Project-Scoped Governance UI

No `NEEDS CLARIFICATION` markers remain in the Technical Context (spec.md's own open question was resolved directly with the user during `/speckit-specify`, before this plan). This document records the concrete findings from reading the actual existing code, which determined the Technical Context and Constitution Check answers above.

## Decision: Reuse the existing write path unmodified

**Decision**: `createObjective`, `updateObjective`, `deleteObjective` (all already exported from `@/bcs/governance`) need zero changes for project scope.

**Rationale**: Direct inspection of `src/bcs/governance/application/create-objective.ts`, `.../objective-validation.ts`, and `.../authorize-objective-action.ts` confirms:
- `CreateObjectiveParams`/`UpdateObjectiveFields` already accept `projectId`.
- `ObjectiveScopeVerifier` already has an (optional) `projectBelongsToOrganization` callback, checked by `assertObjectiveScopesBelongToOrganization` whenever `projectId != null`.
- `assertCanManageObjective` already has a project-scoped branch: org-admin-only, no team-owner override. Its own code comment explicitly flags this as "a conservative default rather than a fully-designed rule; revisit once a real project-objective feature exists" — this feature is that revisit, and the existing conservative default (org-admin-only server-side rejection) already satisfies spec.md's FR-006, so no authorization *logic* change is needed — only the UI-layer expectation was corrected during `/speckit-analyze` (controls stay visible to all viewers; the existing check is what actually enforces admin-only mutation).

**Alternatives considered**: Writing new project-specific create/update/delete functions — rejected, pure duplication of already-correct, already-tested logic.

## Decision: Reuse the existing `listProjectObjectives` — no new function needed

**Implementation-time correction (2026-08-09):** this section originally called for building a new function. While starting that work, `src/bcs/governance/application/list-project-objectives.ts` was found to already exist, already exported from the barrel, already tested, and already documented in `CONTRACT.md` — doing exactly what was about to be built. A duplicate file was written and then deleted once this was discovered. The reasoning below (why *some* function with this exact shape was needed) stayed valid; only "build it" changed to "use the existing one."

**Decision**: Use `listProjectObjectives(db, actor: ObjectiveActor, projectId) => Promise<ObjectiveRow[]>` (`src/bcs/governance/application/list-project-objectives.ts`, already exported from the governance barrel) — no new file.

**Rationale (for why this shape of function, originally)**: No *other* existing exported function returns *only* a project's local objectives with no inheritance/user mixing:
- `resolveEffectiveObjectives(db, actor, userId, projectId?)` requires a `userId` and mixes in that user's own team-chain-derived objectives — wrong shape now that spec.md's clarification removed the inherited-objectives display entirely; using it would require the caller to discard most of its output.
- `resolveEffectiveObjectivesForTeam` has no project-object support at all.
- `listActiveByProject` (infrastructure layer, `objectives-repo.ts`) does exactly the right query already but is not exported past the infrastructure layer — application-layer functions are what a barrel exports in this codebase (confirmed: every other list/resolve function in `governance/index.ts` is an `application/*` export, none are `infrastructure/*`).

**Alternatives considered**:
- Reusing `resolveEffectiveObjectives` and filtering its `.local` array down to `projectId`-owned rows client-side — rejected: still requires a `userId` the project-page caller doesn't naturally have (the page is scoped to a project, not a specific viewing user's own objectives), and would silently also return that arbitrary user's own team/personal objectives mixed into the same array, a correctness risk for a filter-based approach.
- Exporting `listActiveByProject` directly from the barrel instead of adding an application-layer wrapper — rejected: breaks the codebase's own layering convention (barrels export `application/*`, not `infrastructure/*`) with no offsetting benefit, since the wrapper is one line.

## Decision: New governance function needs no additional authorization check of its own

**Decision**: `listProjectObjectives` performs no authorization check — read access is already governed by the caller (the project page itself, which already requires the viewer to be a project member/admin to reach this route at all) and by RLS.

**Rationale**: Matches the existing precedent — `resolveEffectiveObjectivesForTeam` (the closest sibling function) also performs no per-call authorization check beyond org-scoping; visibility gating happens at the page/route level, not duplicated inside every governance read function. FR-006's "non-admin can view but not mutate" requirement is satisfied by the *mutation* functions' existing admin-only check (unchanged), not by gating the read.

**Alternatives considered**: Adding a role check inside the new function — rejected as inconsistent with the sibling read function's own established pattern, and redundant with the page-level access control the project detail page already has for every other tab.

## Decision: Cross-BC identity verification via a new `projectBelongsToOrganization` callback in the project page's own `actions.ts`

**Decision**: Extend (or add a second) `ObjectiveScopeVerifier` factory in `src/app/(app)/projects/actions.ts`, supplying `projectBelongsToOrganization: async (orgId, projectId) => (await getProject(tx, orgId, projectId)) !== null`.

**Rationale**: `getProject(db, organizationId, projectId)` (prompt-registry, already exported) returns `null` on a not-found/cross-org project rather than throwing — confirmed by reading `src/bcs/prompt-registry/application/get-project.ts` directly, so the verifier checks for a non-null return rather than try/catch (the try/catch shape used by the *other* existing verifier callbacks in this codebase, e.g. `teamBelongsToOrganization`, is specific to `getTeam`/`getUser`'s throw-on-not-found behavior — `getProject` behaves differently and the adapter must match it, not copy the try/catch shape blindly).

**Alternatives considered**: Reusing `makeProjectIdentityVerifier` (the existing `ProjectIdentityVerifier` adapter in `src/app/(app)/projects/project-identity-verifier.ts`) — rejected: that adapter implements a *different* interface (`ProjectIdentityVerifier`, used when *creating* a project, verifying identity-access entities like team/user/org from prompt-registry's side) that happens to share naming conventions but is not the same contract as governance's `ObjectiveScopeVerifier` (which needs `projectBelongsToOrganization`, a check `ProjectIdentityVerifier` doesn't have at all). Confusingly similar names, genuinely different interfaces — do not conflate them.

## Decision: Extend `ObjectiveDrawer`'s `scopeKind` union rather than building a new drawer

**Decision**: `scopeKind: "team" | "person"` → `"team" | "person" | "project"` in `src/app/(app)/teams/[teamId]/objective-drawer.tsx`; the project page imports and reuses this same component.

**Rationale**: The component already takes `scopeLabel`/`scopeKind`/`mode`/`initialValues`/`onClose`/`onSubmit` as fully generic props. The only place `scopeKind` drives conditional copy is a single `scopeKind === "team" ? <cascades text> : <does-not-cascade text>` ternary — its `else` branch ("defined for {scopeLabel} only — it does not cascade to anyone else") is already exactly correct for project scope too, so this needs a pure type-union widening (`"team" | "person"` → `"team" | "person" | "project"`) with **zero internal branch changes**. Matches tenet U5 (shared interaction patterns live once, reused — never copy-pasted per feature).

**Alternatives considered**: A new `ProjectObjectiveDrawer` component — rejected, pure duplication with no behavioral difference from the existing drawer.
