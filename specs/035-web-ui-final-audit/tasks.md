---

description: "Task list for 035-web-ui-final-audit"
---

# Tasks: Web UI Final Composition & Integration Check — Re-Verification

**Input**: Design documents from `/specs/035-web-ui-final-audit/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested beyond the existing suite staying green if any code changes. This feature is a verification checkpoint; Phase 0 research already found no page-level gap requiring new code, so no new test suite is anticipated — Constitution Principle I still applies to any fix task that does turn out to be needed.

**Organization**: Tasks are grouped by user story. Phase 0 planning research (`research.md`) already resolved the *static* audit questions (shell composition, nav model, legacy parity classification) by direct source inspection. The tasks below are the concrete, live actions still needed: browser-driven verification against the running app, the REST-driven chain-run smoke test, and closing out the source backlog item per this feature's Clarifications answer (fix any real gap found; the backlog item must actually close).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Confirm the shared dev stack is reachable for live verification (`docker ps` shows `spechub-app-1`/`spechub-database-1` up; `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login` returns `200`) — done, stack was already up (no rebuild performed).

---

## Phase 2: Foundational

No new shared infrastructure is needed. One shared setup step serves every user story below:

- [X] T002 Register (or reuse) a fresh test org via `/register`, capturing the resulting team/user for use across US1, US3, US4 — reused the existing "Acme Corp" org / "Platform" team / Alice Admin session from the backlog item's own prior 2026-08-05 smoke test (fresh registration is impossible here — this self-hosted instance enforces a single-org guard); recorded in `quickstart.md`.

**Checkpoint**: A live, authenticated session exists for the audit below.

---

## Phase 3: User Story 1 - Confirm every bounded-context page still composes into the one real shell (Priority: P1) 🎯 MVP

**Goal**: Live-confirm shell composition is still clean, per `research.md` §1's static findings.

**Independent Test**: Sign in and navigate to every page reachable from shell navigation, confirming single shell chrome and correct active nav state throughout.

### Implementation for User Story 1

- [X] T003 [US1] [P] Using the session from T002, visit each of the 8 nav entries (Overview, Prompts, Governance, Teams, Projects, Metrics, API keys, Audit log) and confirm each renders inside the same `AppShell`/`AppNavigation` chrome with the correct item marked active — done, all 8 confirmed live via browser walkthrough, recorded in `parity-audit.md` ("Shell composition").
- [X] T004 [US1] [P] Directly visit `teams/[teamId]/objectives` and the project detail page's Governance tab by URL (not via nav click) and confirm both still render inside the shared shell — done, both confirmed, recorded in `parity-audit.md`.
- [X] T005 [US1] If T003/T004 finds any drift (dead nav entry, second shell/chrome, page rendering outside `AppShell`), fix it — no drift found, no nav/shell code fix needed. A real but unrelated live-blocking issue *was* found and fixed while verifying the Prompts row in US2 (stale DB migrations, not a UI/nav gap) — see `parity-audit.md`'s "Live-blocking issue found and fixed" section.

**Checkpoint**: Shell composition is live-confirmed clean (expected outcome per `research.md` §1: no fix needed).

---

## Phase 4: User Story 2 - Re-run the legacy parity audit with both prior gaps closed (Priority: P1)

**Goal**: Produce `parity-audit.md`'s full matrix, live-confirming every row from `research.md` §2, with special attention to the two previously-open rows.

**Independent Test**: Every row in the matrix ends in "rebuilt," "rebuilt (replaced)," "rebuilt (additive)," or "intentional exclusion" — zero rows left "missing."

### Implementation for User Story 2

- [X] T006 [US2] [P] Write `specs/035-web-ui-final-audit/parity-audit.md`'s route-family matrix using `research.md` §2 as the baseline (12 rows: welcome/root, login/register/invite, settings-API-keys, settings-audit-log, teams-membership, teams-policy/objective, projects, prompts, workflows/skill-chains, metrics, health/proxy, project-scoped-governance) — done.
- [X] T007 [US2] Live-exercise policy and objective create/edit/delete via `teams/[teamId]/policies` and `.../objectives` (the previously-blocking row) — done, created policy `audit-035-no-secrets` via the real UI, appeared instantly in the scope tree; recorded in `parity-audit.md`.
- [X] T008 [US2] Live-exercise chain-kind skill authoring via `chain-step-builder.tsx` on a prompt's detail page — done, created `audit-035-chain` v1 with 2 steps (second depends on first), confirmed in the Steps tab; recorded in `parity-audit.md`.
- [X] T009 [US2] Re-confirm every other previously-"Rebuilt" row still works live — done: created a project via the UI, created and published a skill version with expand/Preview, confirmed both live. **Found (via the Prompts row): the shared dev DB was 3 migrations behind, breaking prompt detail pages and the Projects list entirely** — fixed via `pnpm db:migrate` (see `parity-audit.md`); all rows confirmed clean afterward.
- [X] T010 [US2] If T007/T008/T009 finds a real (non-trivial) gap in any row, build the missing page/drawer/wiring — no UI/code gap found in any row; the one real gap found (T009) was environment drift (stale migrations on the shared dev stack), fixed non-destructively via `pnpm db:migrate`, not a `src/app` code change, so FR-010/FR-011 (UI conventions, entitlement gating) don't apply to this fix.

**Checkpoint**: `parity-audit.md` matrix is complete with zero "missing" rows (expected outcome per `research.md` §2: no fix needed, both previously-open rows already closed).

---

## Phase 5: User Story 3 - Confirm protected-route behavior still holds (Priority: P2)

**Goal**: Confirm no page added since the prior audit (governance pages, chain-authoring UI) bypasses the shared auth gate.

**Independent Test**: Every authenticated route family, requested with no session, redirects to `/login`.

### Implementation for User Story 3

- [X] T011 [US3] [P] Sign out (or open an unauthenticated session) and request each `(app)` route family directly by URL, including `teams/[teamId]/policies`, `teams/[teamId]/objectives`, and a project detail page's Governance tab — confirm every one redirects to `/login` — done, live `curl` sweep, all 10 authenticated route families 307 → `/login`; recorded in `parity-audit.md`.
- [X] T012 [US3] Confirm public pages (`/`, `/login`, `/register`, `/welcome`) still render `200` and are unaffected by the same gate — done, `/`/`/login`/`/register` all 200; `/welcome` 307s but to its own unrelated single-org-guard logic, not the `(app)` auth gate (confirmed by reading the route) — recorded in `parity-audit.md`.

**Checkpoint**: 100% of authenticated route families redirect; public pages unaffected (SC-003).

---

## Phase 6: User Story 4 - Run the full end-to-end smoke test through a governed, chained skill (Priority: P2)

**Goal**: Execute the complete backlog-item smoke test live, including the chain-run step, which is triggered via REST (not the UI) by design — see `research.md` §3.

**Independent Test**: Every step's outcome is observable, and the chain run reaches a terminal state.

### Implementation for User Story 4

- [X] T013 [US4] Using the T002 session, create a project, then a policy via `teams/[teamId]/policies` (not the REST API directly) — done, project "UI Final Audit 035" and policy `audit-035-no-secrets`; recorded in `quickstart.md`.
- [X] T014 [US4] Create a prompt, publish a template-kind version with no `{{ }}` placeholders, expand it via the UI, and confirm the applied policy appears in the result — done, `audit-035-prompt` v1, Preview tab showed both applicable policies appended correctly; recorded in `quickstart.md`.
- [X] T015 [US4] Author a chain-kind skill version with at least 2 steps via `chain-step-builder.tsx` — done, `audit-035-chain` v1, 2 steps, step 2 depends on step 1; recorded in `quickstart.md`.
- [X] T016 [US4] Issue an API key via `settings/api-keys`, then trigger and drive the chain run to a terminal state via direct REST calls — done, key `audit-035-chain-run-key` (`workflows:run` scope), run reached `status: "completed"` after 2 `advance` calls; recorded in `quickstart.md`.
- [X] T017 [US4] Return to the prompt detail page's Run History tab and confirm the run and each step's resolved content/self-reported status render correctly — done, both steps shown with `success` status and matching resolved content; recorded in `quickstart.md`.
- [X] T018 [US4] If any step in T013-T017 fails for a reason other than the documented "no UI run-trigger by design", treat it as a real gap and fix — no failures; every step passed on first attempt.

**Checkpoint**: Full smoke test passes end-to-end (SC-004); UI's read-only run-history view is proven accurate against a REST-driven run.

---

## Phase 7: Polish & Closeout

**Purpose**: Close the source backlog item now that every Requirement/Acceptance Criterion has live evidence, per this feature's Clarifications answer (SC-006).

- [X] T019 Update `backlog/008-distribution/003-web-ui-shell-and-core-pages.md` — done, all 3 Requirements + 3 Acceptance Criteria checked off, `status: done`, final closing note added referencing `parity-audit.md`/`quickstart.md`.
- [X] T020 Move the backlog item to `backlog/008-distribution/archive/003-web-ui-shell-and-core-pages.md` and update `backlog/008-distribution/EPIC.md`'s Features list (checkbox + archive link) — done. Since this closed the epic's last open item (all 8 features now archived), also moved the whole epic to `backlog/done/008-distribution/`, matching the exact precedent set on `main` mid-session for epics 005/006 (pure `git mv`, no cross-reference rewrites elsewhere — consistent with how that precedent commit behaved).
- [X] T021 [P] Run `pnpm typecheck` — clean, no regressions (expected — no `src/app`/`src/bcs` code changed by this feature).
- [X] T022 [P] Run `pnpm lint` — clean, no regressions.
- [X] T023 Run a scoped `pnpm vitest run` against any files touched by T005/T010/T018 (if any) — N/A, no code files were touched (the only fix was `pnpm db:migrate` against the shared dev DB, an infra operation, not a source change).
- [X] T024 Run `pnpm build` if any code changed — N/A, same reason as T023.
- [X] T025 Run `speckit-analyze` and remediate any cross-artifact issues it reports before considering implementation complete — done during planning (3 findings, all remediated: FR-011 added for entitlement gating on any future fix, T005/T010/T018 citations updated, T016 scope note clarified).
- [ ] T026 Run the project's `as-finish` pipeline and address anything it reports.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — the test org from T002 is reused by US1, US3, US4.
- **User Stories (Phase 3-6)**: All depend on Phase 2. US1/US2 (P1) are the priority pair; US3/US4 (P2) can run after, or in parallel with, US1/US2 once T002 exists — none of the four stories writes to a file another one reads.
- **Polish (Phase 7)**: Depends on all four user story phases being complete, since T019/T020 need every story's evidence to check off the backlog item's Requirements/Acceptance Criteria truthfully.

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other stories.
- **User Story 2 (P1)**: No dependency on other stories.
- **User Story 3 (P2)**: No dependency on other stories.
- **User Story 4 (P2)**: No dependency on other stories, though it reuses the org/project T002/T013 create — self-contained within its own phase.

### Parallel Opportunities

- T003/T004 (US1) can run in parallel — different pages, no shared file.
- T006 (US2, writing the matrix skeleton) can run in parallel with early US1 work.
- T011 (US3) can run in parallel with US1/US2 once T002's org exists (only needs an unauthenticated session, which doesn't contend with the authenticated one).
- T021/T022 (typecheck/lint) can run in parallel with each other.
- US1, US2, US3, and US4 phases themselves can be worked in parallel (by separate passes or agents) since none shares a write target — only Phase 7 serializes on all of them finishing.

---

## Parallel Example: User Story 1

```bash
# After T002 (test org exists), run both live shell checks together:
Task: "Visit each of the 8 nav entries and confirm single shell chrome (T003)"
Task: "Visit teams/[teamId]/objectives and project Governance tab directly by URL (T004)"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (US1) and Phase 4 (US2) — the two P1 stories, and the two that directly re-verify the backlog item's previously-open blockers.
3. **STOP and VALIDATE**: `parity-audit.md` shows zero "missing" rows and clean shell composition.

### Incremental Delivery

1. Setup + Foundational → test org ready.
2. US1 → shell composition confirmed (or fixed) → checkpoint.
3. US2 → parity matrix complete (or gaps fixed) → checkpoint.
4. US3 → protected routes reconfirmed → checkpoint.
5. US4 → full smoke test, including the REST-driven chain run → checkpoint.
6. Polish → backlog item archived, epic 008 closed, `as-finish` run.

---

## Notes

- Every user story phase in this feature is audit/verification work first; a "fix" sub-task (T005, T010, T018) only produces a code change if live verification actually finds a real gap. Per `research.md`, none is currently expected — but per this feature's Clarifications answer, if one surfaces, it is fixed here, not filed forward.
- [P] tasks touch different files/pages with no shared write target.
- Record every finding directly in `parity-audit.md`/`quickstart.md` as you go — these two files are the evidence FR-009/SC-006 require before Phase 7 can truthfully close the backlog item.
