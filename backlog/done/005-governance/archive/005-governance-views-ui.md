---
epic: 005-governance
feature: 005-governance-views-ui
status: done
dependencies: ["003-hierarchical-resolution-engine.md", "004-governance-tenant-isolation-tests.md", "backlog/004-app-shell-and-landing/002-app-shell-and-navigation.md"]
---

# Governance Views UI

The real, finished policies/objectives UI — owned by this BC per `bcs/governance/OWNERSHIP.md` (`src/app/(app)/teams/*/policies`, `/objectives`) — built directly against the real `SkillCanon Governance.dc.html` mockup (claude.ai/design project `7babdbf3-c063-46b5-84df-ffa9f588d88a`), mirroring `003-audit-compliance/003-audit-log-ui.md`'s pattern: schema/query gaps found while reading the mockup were resolved via `/speckit-clarify` (see `specs/031-governance-views-ui/spec.md`), and this feature builds the page for real, composed into the shared shell from `004-app-shell-and-landing/002-app-shell-and-navigation.md`.

**Completed 2026-08-05** via `specs/031-governance-views-ui/` (spec → clarify → plan → tasks → implement). Live-verified in a real browser against a fresh self-hosted registration: scope tree, header/breadcrumb/tabs, empty states, policy creation (4-way enforcement picker including `validate`), person-scope policy-creation restriction, objective creation at both team and person scope.

Was directly blocking `backlog/008-distribution/003-web-ui-shell-and-core-pages.md` and `backlog/010-ui-polish-and-accessibility/001-cross-page-polish-and-accessibility.md` — both notified this blocker is now closed.

## Requirements

- [X] Scope tree sidebar: filterable team/user hierarchy, each node showing a local policy+objective count badge — `src/app/(app)/teams/[teamId]/scope-tree.tsx` + `scope-tree-data.ts`, depth-first tree order (not flat alphabetical), backed by the new `countLocalPoliciesAndObjectives` aggregate
- [X] Main panel: Policies/Objectives tabs, each split into an "Inherited" group (from ancestor scopes, immutable, read-only) and a "Local" group (editable at the selected scope) — `governance-view.tsx`
- [X] "New policy"/"New objective" drawer: name, enforcement-type selector, priority, content — enforcement-type selector offers all four real values (`prepend`/`append`/`inject`/`validate`), resolved via `/speckit-clarify` (see spec.md's Clarifications session)
- [X] "View as a specific person" — satisfied by the scope tree itself: selecting a person row (not a dedicated separate "view as" control) switches the effective-governance view to that person's resolved policies/objectives, reusing the existing `resolveEffectivePolicies(db, actor, userId)`/`resolveEffectiveObjectives(...)` contract. The spec deliberately implemented this as scope selection rather than a distinct admin-preview affordance — same underlying capability, simpler UI.
- [X] Empty states for "no local policies/objectives at this scope" per the mockup

## Acceptance Criteria

- [X] Selecting a different scope-tree node updates the Inherited/Local split correctly for that node — verified live (Platform team → Alice Admin person)
- [X] Creating a policy with the `validate` enforcement type works end-to-end (schema, resolution, and this UI all agree on the same four-value enum) — all four options render in the drawer; `append` verified end-to-end live, `validate`/`prepend`/`inject` covered by `policy-drawer.test.tsx`
- [X] Per-node counts match the actual number of local policies+objectives at that node — verified live (count badge updated 0 → 1 after creating a policy)
- [X] The page visually matches `SkillCanon Governance.dc.html`

## Open Questions

- **Resolved**: the "New policy" drawer offers all four enforcement types (`prepend`/`append`/`inject`/`validate`) — see spec.md's Clarifications session.
- **Resolved, deferred to a new feature**: project-scoped policy/objective management (the scope tree only navigates team/user hierarchy, no project node) was deliberately excluded from this feature's scope (see spec.md's Assumptions) rather than built against a mockup that never depicted it. Tracked at `006-project-scoped-governance-ui.md`.
- **Resolved, not needed**: the mockup's unused merged/priority-sorted `previewPolicies`/`previewObjectives` list was never rendered anywhere in the mockup's own visible markup either — the spec's two-group Inherited/Local split is the actual UI; no separate "final effective order" view was required by any user story or acceptance criterion.

## Dependencies

- `003-hierarchical-resolution-engine.md`
- `004-governance-tenant-isolation-tests.md`
- `backlog/004-app-shell-and-landing/002-app-shell-and-navigation.md`

## Technical Notes

Implemented via the full speckit pipeline at `specs/031-governance-views-ui/`. Two real, previously-undocumented gaps surfaced and fixed as part of implementation, beyond what the spec anticipated:

1. **Governance's write path had no authorization check at all** — `createPolicy`/`updatePolicy`/`deletePolicy`/`createObjective`/`updateObjective`/`deleteObjective` accepted any caller in the organization, not just an org-admin or the relevant team's owner. Fixed by adding `assertCanManagePolicyForTeam`/`assertCanManageObjective` (`src/bcs/governance/application/authorize-{policy,objective}-action.ts`) to all six write functions before this UI shipped on top of them — a real, previously-unknown security gap, not something introduced by this feature.
2. **Client/server module-boundary bug**: `scope-tree.tsx`'s `"use client"` directive made its pure data functions (`buildScopeRows`, `chainRootFirst`, `scopeKey`) unusable from the server-side page loader — split into `scope-tree-data.ts` (no directive, pure functions/types) and `scope-tree.tsx` (client-only `ScopeTree` component), matching this repo's documented client/server barrel-import gotcha but in the opposite direction (a server module failing to call a client-tagged function, not a client bundle pulling in server code).

Also fixed a copy bug caught during live verification: `objective-drawer.tsx`'s info callout originally read "...surfaces as guidance for every descendant, unless {scope} is an individual person" (a confusing unresolved-conditional phrasing) — now takes an explicit `scopeKind` prop and states the two cases plainly ("cascades to all descendant teams and users" for team scope; "defined for {name} only — does not cascade" for person scope).
