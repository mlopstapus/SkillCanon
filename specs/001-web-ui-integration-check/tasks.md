---

description: "Task list for 001-web-ui-integration-check"
---

# Tasks: Web UI Final Composition & Integration Check

**Input**: Design documents from `/specs/001-web-ui-integration-check/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md, contracts/README.md

**Tests**: Not explicitly requested beyond keeping the one touched fixture (`nav-model.test.ts`) green — this feature is a verification checkpoint, not new backend logic, so Constitution Principle I's red-green-iterate applies to the one small edit in scope, not a new test suite.

**Organization**: Tasks are grouped by user story. This feature is mostly an audit (already producing evidence during planning); the tasks below are the concrete, checkable remaining actions.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Confirm the dev stack is reachable for live verification (`docker compose ps`; `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/`) — done, `skillcanon-app-1`/`skillcanon-database-1` already running, remapped to `localhost:3001`/`5434`.

---

## Phase 2: Foundational

No new shared infrastructure is needed — this feature audits the existing shell/routes and touches one existing shared file. Nothing blocks the user stories below beyond Phase 1.

---

## Phase 3: User Story 1 - Verify every core page is reachable through the real shell (Priority: P1) 🎯 MVP

**Goal**: Confirm every rebuilt bounded-context page renders inside the one shared `(app)` shell, with no stale standalone shell/nav chrome left over.

**Independent Test**: Enumerate every `page.tsx` under `src/app/(app)` and `src/app/(auth)`, confirm each is reachable only via its respective layout's single auth gate, and confirm the shared nav model has no entry pointing at a route that will never exist.

### Implementation for User Story 1

- [X] T002 [US1] Enumerate all routes under `src/app/(app)` and `src/app/(auth)` and confirm each renders under its group's single `layout.tsx` (no second `AppShell`/`AppNavigation` implementation anywhere in the tree) — findings in `specs/001-web-ui-integration-check/parity-audit.md` ("Summary against Success Criteria" / SC-002).
- [X] T003 [US1] Confirm `settings/audit-log/access.ts`'s `canAccessAuditLog` is a role-permission check layered inside the shared shell, not a competing auth gate (FR-002 edge case) — confirmed, documented in `parity-audit.md`.
- [X] T004 [US1] Remove the stale `workflows` nav entry from `src/app/(app)/_components/nav-model.ts` (`NavKey` union member, `directRoutes` tuple, `getNavigation`'s Workspace section item) — retired by PDR-017, no page will ever exist at `/workflows` under that name.
- [X] T005 [US1] Remove the now-unused `workflows` icon path from `src/app/(app)/_components/app-navigation.tsx`'s `iconPaths` map (same edit, keeps the `Record<NavKey, string>` type exhaustive).
- [X] T006 [US1] Update `src/app/(app)/_components/nav-model.test.ts` (and `app-navigation.test.tsx`, which also asserted the stale href/count) to drop the `workflows` entry, keeping the suite green (Constitution Principle I).

**Checkpoint**: Every composed page is confirmed under the single shared shell; the one stale nav entry pointing at a retired route is removed; no duplicate chrome exists anywhere.

---

## Phase 4: User Story 2 - Confirm legacy workflow parity across the rebuilt UI (Priority: P1)

**Goal**: Produce a documented parity classification for every legacy route family.

**Independent Test**: `specs/001-web-ui-integration-check/parity-audit.md` classifies all 9 legacy route families named in FR-003 as rebuilt, replaced, removed, or missing, with an owner for anything not rebuilt.

### Implementation for User Story 2

- [X] T007 [US2] Diff `legacy/frontend/src/app/**` route directories against `src/app/(app)/**` + `src/app/(auth)/**` and classify each family — done, `parity-audit.md`.
- [X] T008 [US2] For each legacy page importing governance functions inline (`legacy/frontend/src/app/teams/page.tsx` imports `createPolicy`/`createObjective`/etc.), confirm whether the rebuilt `(app)/teams/page.tsx` carries the same capability — confirmed it does not; recorded as the `005-governance/005-governance-views-ui.md` gap in `parity-audit.md`.
- [X] T009 [US2] Confirm the legacy `workflows/*` route family's replacement (`006-prompt-registry/010-skill-chain-views-ui.md`, per PDR-017) is real (not invented) by reading that backlog item and `009-skill-chains.md` — done, cited in `parity-audit.md`.
- [X] T010 [US2] Confirm the legacy `metrics/page.tsx` family's status against `008-distribution/004-usage-telemetry.md` (open) and the already-shipped project-level metrics chart — done, recorded in `parity-audit.md`.
- [X] T011 [US2] Record the `health`/`api/[...path]` legacy proxy routes' retirement (superseded by native `src/app/api/**`) and the one small residual gap (no `/health` liveness route) — done, recorded in `parity-audit.md`.

**Checkpoint**: `parity-audit.md` is complete and every non-rebuilt family has a named owner.

---

## Phase 5: User Story 3 - Validate protected-route behavior for the composed app (Priority: P2)

**Goal**: Confirm every authenticated route family redirects unauthenticated requests to login before any protected content (or bare 404) renders.

**Independent Test**: Live HTTP sweep against every authenticated route family with no session cookie.

### Implementation for User Story 3

- [X] T012 [US3] Run a live redirect sweep (`curl`) against every authenticated route family, including the two now-confirmed-missing ones (`/workflows`, `/metrics`) and the governance route (`/teams/x/policies`), to prove the shared gate fires even when no matching page exists — done, results in `quickstart.md` ("Protected-Route Sweep").
- [X] T013 [US3] Confirm unauthenticated public pages (`/login`, `/register`, `/`) render `200` and are not caught by the same gate — done, in `quickstart.md`.

**Checkpoint**: 100% of authenticated route families redirect to `/login`; public pages are unaffected. SC-005 satisfied.

---

## Phase 6: User Story 4 - Smoke test the end-to-end governed prompt flow (Priority: P2)

**Goal**: Determine how far the team → project → policy → prompt → expansion flow can be completed purely through the composed UI today, and pin down exactly what blocks full completion.

**Independent Test**: For each step, confirm (via server action / route handler code) whether a UI path exists and whether it calls real REST-backed application-layer functions rather than mock data.

### Implementation for User Story 4

- [X] T014 [US4] Confirm `createTeamAction`/`createProjectAction`/`createPromptAction` each call real `@/bcs/*` functions wrapped in `withTenantContext`, not mock data — done, `quickstart.md` ("Smoke Flow Results").
- [X] T015 [US4] Confirm no page/drawer/server action under `src/app/(app)` calls `createPolicy`/`createObjective` (only `src/app/api/policies` / `src/app/api/objectives` REST routes do) — done, this is the FR-013 blocker, recorded in `quickstart.md` and cross-referenced to the `parity-audit.md` governance gap.
- [X] T016 [US4] Confirm the prompt detail page's expansion call uses the real `expand()` function and that `prompt-detail-view.tsx` renders `appliedPolicies` in the result (FR-014/SC-006's UI contract) — done, `quickstart.md`.

**Checkpoint**: Smoke-flow findings are complete; the one blocker (policy creation has no UI) is attributed to its owning epic per FR-015, not implemented here.

---

## Phase 7: Polish & Verification

- [X] T017 Run `pnpm typecheck` — confirm no regressions from the `nav-model.ts`/`app-navigation.tsx`/`nav-model.test.ts` edit.
- [X] T018 Run `pnpm lint` — confirm no regressions.
- [X] T019 Run `pnpm vitest run src/app/\(app\)/_components/nav-model.test.ts src/app/\(app\)/_components/app-navigation.test.tsx` — confirm the touched suite is green.
- [X] T020 Run full `pnpm test` (background/extended timeout per this repo's own convention) — confirm no unrelated regressions.
- [X] T021 Run `pnpm build` — confirm the app still compiles/bundles cleanly (catches any client/server bundle-split issue the narrow edit could theoretically introduce).
- [X] T022 Run `speckit-analyze` and remediate any cross-artifact issues before implementation is considered complete.
- [X] T023 Run the project's `as-finish` pipeline and address anything it reports.

---

## Dependencies & Execution Order

- Phase 1 (Setup) → Phase 2 (Foundational, no-op here) → Phases 3-6 (user stories, already substantially completed during planning research) → Phase 7 (Polish/Verification, the remaining real work).
- US1 (T002-T006) is the only phase with a code change; US2/US3/US4 are audit/documentation phases with no code dependency on US1, but all are already-gathered evidence being finalized in the same pass.

## Implementation Strategy

This feature's "MVP" is US1 (the one real composition-wiring fix) plus the audit artifacts from US2-US4, all of which were produced together during planning since they share the same underlying route/code investigation. Phase 7 is what remains to close out the change: verify the small edit doesn't regress typecheck/lint/tests/build, then run analyze/finish and hand off for review.
