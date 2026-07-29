# Phase 0 Research: Audit Log UI

No `NEEDS CLARIFICATION` markers remained after `/speckit-clarify` — all Technical Context fields were resolved directly from reading the existing codebase (no unknowns needed external research). This document instead records the investigative decisions that shaped `plan.md`, since they came from real code inspection rather than the spec text alone.

## Decision: Resource display-name resolution scope

**Decision**: Resolve a resource's display name live, per row, via a new `resolveResourceDisplayName(db, organizationId, resourceType, resourceId)` function in `src/bcs/audit-compliance/application/`. It dispatches on `resourceType` to the owning BC's public getter, and falls back to the raw `resourceId` only for the one type with no suitable existing lookup at any layer.

**Rationale**: Grepping every real `record(tx, { resourceType, ... })` call site in the codebase (not just the mockup's illustrative sample data) surfaced the actual set of resource types in production today: `user`, `team`, `organization`, `invitation`, `api_key`, `project`, `prompt`, `prompt_version`, `project_member`, `policy`, `objective`. Cross-referencing each type against its BC's *infrastructure* layer (not just what's already exported through the public barrel) found that most already have an id-based finder one thin `application/` wrapper away from being real, contract-exposed getters:

| resourceType | Existing infra finder | Resolution | Notes |
|---|---|---|---|
| `team` | `getTeam(db, orgId, teamId)` (already public) → `.name` | Resolved | No new code |
| `organization` | `getOrganization(db, orgId)` (already public) → `.name` | Resolved | No new code |
| `user` | `getUser(db, userId, orgId)` (already public) → `.displayName` | Resolved | No new code |
| `policy` | `getPolicy(db, actor, policyId)` (already public) → `.name` | Resolved | No new code |
| `objective` | `getObjective(db, actor, objectiveId)` (already public) → `.title` | Resolved | Uses `title`, not `name` |
| `project` | `getProject(db, orgId, projectId)` (already public) → `.name` | Resolved | No new code |
| `invitation` | `invitations-repo.findByOrgAndId` exists but isn't exported past infra | Resolved | New thin `getInvitation()` app export → `.email` |
| `api_key` | `api-keys-repo.findByOrgAndId` exists but isn't exported past infra | Resolved | New thin `getApiKeySummary()` app export → `.name` |
| `prompt` | `prompts-repo.findPromptByOrgAndId` exists but isn't exported past infra (only name-based `getPrompt` is public) | Resolved | New thin `getPromptById()` app export → `.name` |
| `prompt_version` | `prompt-versions-repo.findVersionById` exists but isn't exported past infra | Resolved | New thin `getPromptVersion()` app export → `.version` |
| `project_member` | No id-based finder anywhere — `project-members-repo` only has `findByProjectAndUser`/`listByProject`, both requiring the composite key, not a bare row id | Raw-id fallback | Genuine gap; also arguably has no natural single "name" as a join-row type |

Only `project_member` needs the fallback path — every other real resource type already has (or is one thin, same-shape wrapper away from having) a working id-based lookup.

**Alternatives considered**:
- *Denormalize a `resourceName` column onto `AuditEvent` at write time*: rejected — would require a schema migration plus retrofitting every existing `record()` call site across 4 bounded contexts, for a presentation-only concern; also directly contradicts the immutability rationale (a resource's name at the time of the event vs. its current name are different questions, and the spec's clarification explicitly chose live resolution over a stored snapshot).
- *Treat every type beyond team/org/user/policy/objective/project as a raw-id fallback, since they weren't in the public barrel yet*: rejected once the infra-layer grep showed `findByOrgAndId`/`findByOrgAndId`/`findPromptByOrgAndId`/`findVersionById` already exist — writing a thin `application/` wrapper for each (matching the exact shape of every other `getX` function already in these BCs) is a same-pattern, low-risk addition, not new design; leaving working data unreachable behind a fallback would be the lazier and worse choice.
- *Show only `resourceType` + raw id everywhere, no resolution at all*: rejected — the Audit Log Clarifications explicitly chose best-effort live resolution over this simpler-but-less-useful option.

## Decision: Real entitlement resolution for retention days (post-analyze correction)

**Decision**: Add `resolveAuditEntitlementsForOrg(organizationId)` in `src/bcs/audit-compliance/application/`, which calls the real `resolveEntitlements(organizationId)` from `@/bcs/billing-entitlements` for `auditRetentionDays`, and keeps `canExportAuditEvents` hardcoded `false` (no real export-specific key exists in `EntitlementSnapshot` yet). Update `list.ts`, `export.ts`, and `prune.ts` — the three existing callers of the old domain-layer `resolveAuditEntitlements()` stub — to call this new, org-scoped, async function instead. Drop the "tier name" concept from the pagination footer entirely; show only the resolved retention-days number.

**Rationale**: `/speckit-analyze` (finding C1) discovered that `billing-entitlements` already exists as a real bounded context, and its own `CONTRACT.md` already lists "Audit & Compliance" as an intended consumer of `resolveEntitlements` — a wiring that was simply never done. `audit-compliance`'s own `resolveAuditEntitlements()` (in `domain/audit-event.ts`) is a same-BC-only stub that duplicates (and never talks to) the real mechanism. This also invalidated a second, related plan: the original design used `getOrganization(...).planId` as a "tier label" for the pagination footer, but `OrgSummary.planId` is a nullable **UUID** foreign key to a not-yet-built `plans` table (per `identity-access`'s own schema comment) — not a human-readable name. No human-readable plan/tier name exists anywhere in this codebase yet (not even in `billing-entitlements`' own `EntitlementSnapshot`, which has only flags/limits, no name field), so fabricating one would be worse than the mockup's hardcoded "Free" string this feature is explicitly replacing.

**Alternatives considered**:
- *Leave `audit-compliance`'s stub as-is, treat the billing-entitlements gap as a separate feature's problem*: rejected — the fix is small, contained, and behavior-neutral today (both resolvers return the same Free default), and it directly closes a Constitution G1 gap this feature would otherwise ship with, per `/speckit-analyze`'s finding.
- *Use `getOrganization(...).planId` as a display label, accepting it'll show a raw UUID or blank today*: rejected outright once `planId`'s actual type was confirmed — it would be actively misleading, not just incomplete.
- *Invent a client-side static "Free"/"Paid" mapping keyed off some other proxy field*: rejected — no field in this codebase reliably distinguishes plan tiers yet; fabricating one contradicts this feature's whole "never hardcode the tier label" premise.

## Decision: Actor filter option source and actor display-name resolution

**Decision**: Add one new, fully-internal `audit-compliance` query — `listDistinctAuditActors(tx, organizationId, retentionCutoff)` — that selects distinct `(actorUserId, actorApiKeyId)` pairs from `audit_events` within the retained window (no new cross-BC surface; this stays entirely inside the BC that already owns the table). Resolve each distinct id to a display name by reusing the *same* resolver getters as resource-name resolution: `getUser()` for a `actorUserId`, the new `getApiKeySummary()` for an `actorApiKeyId`, and a literal `"system"` label when both are null.

**Rationale**: The Actor dropdown (per Clarifications) must list every distinct actor who actually appears in retained history, not just currently-active org members — but there's no need to invent a new "list every API key across the whole org" cross-BC function to do it. Since `getApiKeySummary(db, orgId, apiKeyId)` is already being added (see the resource-name resolution decision above) to resolve `api_key`-typed *resource* events, the exact same single-id getter resolves an `api_key`-typed *actor* just as well — an api key row is the same table either way. Per-row actor display in the row list reuses this identical resolver, batched by distinct id within a page (dedupe once via a `Map`, not a lookup per row) to avoid an N+1 query pattern across up to 200 rows.

**Alternatives considered**:
- *Add a new org-wide `listAllApiKeys(db, organizationId)` cross-BC function*: rejected — unnecessary duplication once the single-id getter already exists for the resource-resolution use case; would also exceed what any acceptance criterion requires.
- *Restrict the Actor dropdown to currently-active members only*: rejected directly by the spec's Clarifications answer.

## Decision: Cross-BC call pattern

**Decision**: All resolver calls import only from each target BC's public barrel (`@/bcs/identity-access`, `@/bcs/governance`, `@/bcs/prompt-registry`), never internal `application/`/`infrastructure/` modules.

**Rationale**: `eslint-plugin-boundaries` (`003-module-boundary-lint-enforcement`) already enforces this at lint time via `boundaries/dependencies`; a violation would fail CI, not just style review. The resolver module doing this composition belongs in `audit-compliance` (the BC that owns `AuditEvent` and is the presentation surface's contract owner), not in the route folder — keeps this repo's D1 (Domain-Driven Bounded Contexts) principle intact: a UI route composes bounded contexts, but a *new piece of cross-BC domain logic* (mapping resourceType → resolver) belongs in a BC's `application/` layer, not scattered into `src/app/**`.

## Decision: Server/client component split

**Decision**: Follow the exact pattern already established by `settings/api-keys` and `teams`: an async server `page.tsx` does `authenticateSession` + admin gate + initial data fetch via `withTenantContext`, and hands the result to a client component split into a pure `*View` (props in, no hooks needing Next's router context) and a thin wrapper that owns `useRouter`/`useSearchParams` — matching the `NavigationList`/`AppNavigation` and `TeamsExplorerView`/`TeamsExplorer` precedent already in this codebase (see `CLAUDE.md`'s documented gotcha: components needing router context can't be exercised by this repo's `renderToStaticMarkup`-only test convention, so the router-dependent wrapper stays thin and untested, and the `View` carries all the real logic under test).

**Rationale**: Established, working convention already in the codebase; deviating would be inconsistent with zero benefit.

**Alternatives considered**: A single client component doing both filtering-state and router-syncing — rejected, since it can't be tested under this repo's `renderToStaticMarkup`-only convention (the `useRouter()` call throws outside a real Next.js render tree), a gotcha this repo has already hit twice.

## Decision: Filter state persistence

**Decision**: Filter state (search, resource, actor, transport, date range) is read from and written to the URL's query string (`useSearchParams`/`router.replace`), not component-local-only state, so a filtered view is shareable/bookmarkable and survives a page refresh — consistent with this being a compliance investigation tool where an admin may want to hand a filtered URL to another admin or auditor.

**Rationale**: Not explicitly required by the spec, but a reasonable default matching how server-rendered Next.js pages in this app already receive query filters (`page.tsx` reads `searchParams`), and it costs nothing extra since the server component must already parse filters from somewhere to run the initial `listAuditEvents` call.

**Alternatives considered**: Pure client-state-only filters (lost on refresh) — rejected as a strictly worse default with no offsetting simplicity benefit, since `page.tsx` needs to read initial filter values from *somewhere* regardless.
