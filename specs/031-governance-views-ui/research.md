# Research: Governance Views UI

## Decision: Add `resolveEffectivePoliciesForTeam`/`resolveEffectiveObjectivesForTeam` rather than reusing the existing user-scoped functions

**Rationale**: `resolveEffectivePolicies(db, actor, userId)` and `resolveEffectiveObjectives(db, actor, userId, projectId?)` both derive their team chain exclusively from `user.teamId` — there is no way to resolve "effective governance for team X" directly when the selected scope in the UI is a bare team node, not a specific person (confirmed by reading both functions' implementations: each starts with `getUser(db, userId, ...)` and immediately falls back to `user.teamId`). The mockup's scope tree requires viewing effective governance at *either* granularity. The two new functions mirror the existing ones' logic exactly (`getTeamChain` + `listActiveByTeam`, same inherited/local split, same priority sort for policies) but start the chain walk directly from a `teamId` parameter, skipping the user-lookup step entirely.

**Alternatives considered**: Picking an arbitrary team member and calling the existing user-scoped function was rejected — a team can have zero members, and the semantics would be wrong even when one exists (a team's own effective view should never depend on which member happened to be chosen). Denormalizing a `resolveEffectiveForScope(scopeType, scopeId)` polymorphic function was rejected as needless complexity — two small, clearly-named functions matching the existing pair's shape is more consistent with this BC's established one-function-per-concern pattern (`resolveEffectivePolicies`/`resolveEffectiveObjectives` are already separate despite being nearly identical in shape).

## Decision: Policy authoring is structurally team-only already — no new validation needed

**Rationale**: Confirmed by reading `create-policy.ts`/`domain/policy.ts`: `CreatePolicyParams` has no `userId`/person field at all, only `teamId` (required, validated via `assertTeamBelongsToOrganization`, throwing `InvalidPolicyScopeError` if missing). There is no way to even attempt a person-scoped policy through the existing write API — the UI simply must never pass anything but a real `teamId` when calling `createPolicyAction`/`updatePolicyAction`, and must not offer the "New policy"/"Edit" action at all when a person node is the selected scope (FR-005).

**Alternatives considered**: Adding a server-side guard specifically for "reject person-scoped policy creation" was considered unnecessary — the type signature itself makes it structurally unrepresentable, and `InvalidPolicyScopeError` already exists for the "no teamId given" case, which is what a client bug would actually produce.

## Decision: Extend `teams-explorer.tsx`'s tree-ordering algorithm, don't extract a shared version yet

**Rationale**: `teams-explorer.tsx` already has the correct depth-first traversal (`treeOrder`, `depthOf`, `chainRootFirst`) fixing a previously-shipped alphabetical-sort bug (documented in this repo's own history). This feature's scope tree needs the same correctness property, extended to interleave person leaf-nodes under their team (which `teams-explorer.tsx` doesn't need, since it only shows teams). Copying and extending the three small pure functions into this feature's own `scope-tree.tsx` is simpler than extracting a shared, more generic version that would need a "does this include leaf entities" parameter for one caller.

**Alternatives considered**: Extracting a shared `src/shared/ui/tree-order.ts` was considered but deferred — with only two call sites (this feature and `teams-explorer.tsx`) and a real shape difference (team-only vs. team+person), premature extraction risks the same "generic abstraction that doesn't quite fit either caller" problem this repo's own conventions warn against. Revisit if a third tree-shaped UI appears.

## Decision: Policy and Objective drawers are two separate components, not one generic drawer

**Rationale**: The mockup's drawer already implies this — policies need enforcement-mode and priority fields objectives don't have; objectives need a team-or-person scope picker policies don't need (policies are always the currently-selected team, per FR-005). Forcing both into one parameterized drawer component would need internal conditionals for nearly every field, which is more complex than two small, clear components.

**Alternatives considered**: A single `GovernanceItemDrawer` with a `kind: "policy" | "objective"` prop was rejected for the reason above — matches this repo's established preference (see `023-prompt-registry-views-ui`'s own per-purpose drawer files) over one large conditional component.

## Decision: Scope selection and tab switching happen client-side via `?person=`/`?tab=` search params, not full navigation

**Rationale**: FR-013/FR-014 require switching scopes and tabs without leaving the page. The existing route (`/teams/[teamId]/policies` or `/objectives`) already encodes the *team* half of the URL structure (matches nav-model.ts's fixed route shape); a `?person=<userId>` search param layered on top lets the person-scoped view share the same route without inventing a new URL shape nav-model.ts doesn't already expect, and keeps the page linkable/bookmarkable per scope. Tab switching (`policies` vs. `objectives`) is the route segment itself (`/policies` vs `/objectives`), matching `governanceRoutePattern`'s existing regex in `nav-model.ts`, which already expects exactly these two path shapes.

**Alternatives considered**: An all-client-state approach (no URL reflection at all) was rejected — it would make a specific scope/tab impossible to link to or refresh into, a real regression versus the mockup's own "select a row, main panel updates" interaction, which reads as URL-reflected navigation, not ephemeral component state.
