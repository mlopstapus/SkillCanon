---

description: "Task list for skill share/project-drawer consolidation"

---

# Tasks: Skill share/project-drawer consolidation

**Input**: Design documents from `/specs/038-skill-share-consolidation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md — all present

**Tests**: Included. This repo's established convention (Testcontainers-backed tests preceding new backend reads, per `CLAUDE.md`) applies to the one new backend piece (`countForksOfSkill`); UI-layer tests are updated alongside their components.

**Organization**: Tasks are grouped by user story (spec.md: US1 "one sharing control" P1, US2 "enforcement stays on project page" P1, US3 "share summary" P2).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single unified Next.js app at repo root (`src/`) — see plan.md's Project Structure.

---

## Phase 1: Setup

**Not applicable.** No new dependencies, tooling, or scaffolding required — this feature reuses the existing Next.js/Drizzle/Vitest stack and file structure exactly as-is.

---

## Phase 2: Foundational

**Not applicable.** No shared, blocking prerequisite exists across the three user stories — US1 (removal + Share drawer edits) and US3 (new `countForksOfSkill` read) touch disjoint files and can proceed independently; US2 requires no code changes at all. Task numbering starts directly at Phase 3.

---

## Phase 3: User Story 1 - One sharing control on a skill's page (Priority: P1) 🎯 MVP

**Goal**: The skill detail page exposes exactly one sharing-related control (Share), with no separate "Projects" button or drawer.

**Independent Test**: Open any skill's detail page. Confirm only "Share" appears in the toolbar, and that its drawer has no required/optional/enforcement control.

### Implementation for User Story 1

- [X] T001 [US1] Remove the "Projects" toolbar button, `assignOpen` state, `onOpenAssignProjects` prop/callback, and the `AssignProjectsDrawer` render (plus its now-unused `assignSkillToProjectAction`/`unassignSkillFromProjectAction` imports) from `src/app/(app)/prompts/[name]/prompt-detail.tsx`
- [X] T002 [US1] Remove the "Projects" button and `onOpenAssignProjects` prop from `src/app/(app)/prompts/[name]/prompt-detail-view.tsx`; remove the `projectAssignment` field from the `PromptDetailData` type in the same file (keep `projectLabels` untouched)
- [X] T003 [US1] Remove the `projectAssignment` field construction from the data loader in `src/app/(app)/prompts/[name]/page.tsx` (keep the `projectAssociations` variable and `projectLabels` derivation intact — still used for the read-only badge)
- [X] T004 [P] [US1] Delete `src/app/(app)/prompts/[name]/assign-projects-drawer.tsx`
- [X] T005 [P] [US1] Delete `src/app/(app)/prompts/[name]/assign-projects-drawer.test.tsx`
- [X] T006 [US1] Update the intro banner copy in `src/app/(app)/prompts/[name]/share-drawer.tsx` to: "Members of a shared team can subscribe to get live updates as new versions publish, or make a copy they own and edit independently. Only you can edit the original."
- [X] T007 [US1] Normalize the Teams section's grant/revoke button label in `src/app/(app)/prompts/[name]/share-drawer.tsx` from "Share"/"Revoke" to "Grant"/"Revoke", matching the People and Projects sections — turned out to be a no-op: the real code already used a single shared `GrantRow` component with uniform "Grant"/"Revoke" labels across all three sections. The mockup's inconsistency never existed here.
- [X] T008 [US1] Update `src/app/(app)/prompts/[name]/prompt-detail-view.test.tsx` to remove any assertions on the "Projects" button/`onOpenAssignProjects` prop, add an assertion that no requirement/enforcement control renders, and add an assertion (FR-008 regression check) that "Make a copy", Deprecate/Reactivate, and "New version" still render after the Projects-button removal
- [X] T009 [US1] Update `src/app/(app)/prompts/[name]/share-drawer.test.tsx` for the new banner copy (T006) and the normalized Teams label (T007)

**Checkpoint**: User Story 1 is fully functional and testable independently — a skill's detail page has one sharing control, with correct copy and consistent labeling.

---

## Phase 4: User Story 2 - Project enforcement stays on the project page (Priority: P1)

**Goal**: Confirm the project detail page's existing Skills tab (Required/Optional/Available) and the skill page's read-only project-label badge are both fully unaffected by User Story 1's removals.

**Independent Test**: From a project's Skills tab, set a skill Required, then Optional, then remove it — behavior identical to before. From that skill's own page, confirm its project-label badge still shows correctly, read-only.

### Verification for User Story 2

- [X] T010 [US2] Run the existing test suites for `src/app/(app)/projects/[id]/project-detail.tsx` and `project-detail-view.tsx` (unchanged by this feature) and confirm all pass with zero modifications needed — this is the regression check that US1's removals didn't reach into the project route
- [X] T011 [US2] Manually verify quickstart.md's "User Story 2" steps: set/unset a skill's requirement from the project Skills tab, then confirm the skill detail page's `projectLabels` badge reflects it correctly and offers no edit control

**Checkpoint**: User Stories 1 and 2 both hold — enforcement management is confirmed intact and undisturbed on the project page.

---

## Phase 5: User Story 3 - See how widely a skill has spread (Priority: P2)

**Goal**: The skill detail page shows an accurate "X teams · Y subscribers · Z copies" summary.

**Independent Test**: Open a skill with a known team grant, subscription count, and fork count; confirm the pill's three numbers match reality exactly, and that it's hidden when there are no grants at all.

### Tests for User Story 3 ⚠️

> Write this test FIRST, ensure it FAILS before implementing T013–T014

- [X] T012 [P] [US3] Write `src/bcs/prompt-registry/application/count-forks-of-skill.test.ts` (Testcontainers-backed, mirroring `list-subscriptions-for-skill.test.ts`'s shape): asserts `countForksOfSkill` returns the correct count for a skill with 0, 1, and multiple forks, and is scoped to the calling organization (a same-name fork in a different org is not counted)

### Implementation for User Story 3

- [X] T013 [US3] Add `countForksOfSkill(tx, organizationId, sourceSkillId)` to `src/bcs/prompt-registry/infrastructure/prompts-repo.ts` (depends on T012 failing first)
- [X] T014 [US3] Add the thin application-layer wrapper `src/bcs/prompt-registry/application/count-forks-of-skill.ts` calling the repo function (depends on T013)
- [X] T015 [US3] Export `countForksOfSkill` from `src/bcs/prompt-registry/index.ts` (depends on T014)
- [X] T016 [P] [US3] Add the `countForksOfSkill` row to `src/bcs/prompt-registry/CONTRACT.md`'s Exposed APIs table, per `contracts/count-forks-of-skill.md`'s drafted entry (depends on T014)
- [X] T017 [US3] Wire `countForksOfSkill` into `src/app/(app)/prompts/[name]/page.tsx`'s existing `Promise.all([...])` data-fetch block, alongside the already-fetched `listSubscriptionsForSkill` result (depends on T015)
- [X] T018 [US3] Add a new `shareSummary: { teamCount, subscriberCount, copyCount }` field to `PromptDetailData` in `src/app/(app)/prompts/[name]/prompt-detail-view.tsx` (per data-model.md) — there is no pre-existing field to replace; today's pill computes its counts inline in the component body (`totalGrants = data.shareState.teams.filter(...).length + ...`). Remove that inline computation, render the pill from `shareSummary` as "X teams · Y subscribers · Z copies". The pill's *visibility gate* stays computed from `shareState.teams`/`shareState.projects` granted counts, unchanged — `shareSummary` has no "projects granted" field, only the displayed text switches to it. (depends on T017)
- [X] T019 [US3] Update `src/app/(app)/prompts/[name]/page.tsx` to populate `shareSummary` from `listSubscriptionsForSkill(...).length` (teamCount unchanged; subscriberCount = total subscriptions) and the new `countForksOfSkill` result (copyCount) (depends on T017, T018)
- [X] T020 [US3] Update `src/app/(app)/prompts/[name]/prompt-detail-view.test.tsx` for the new three-metric pill text and its visibility rule (depends on T018)

**Checkpoint**: All three user stories are independently functional — one sharing control, unaffected project-side enforcement, and an accurate share summary.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T021 [P] Run `pnpm typecheck` and `pnpm lint` — zero errors
- [X] T022 [P] Run `pnpm exec vitest run --fileParallelism=false --testTimeout=30000 src/app/\(app\)/prompts src/bcs/prompt-registry` — all green, confirming no regressions elsewhere in either touched area — 66 test files / 313 tests passed
- [X] T023 Run every manual step in `quickstart.md` (all three user stories) against a running local dev stack — confirmed live via browser: US1 (one Share button, correct banner copy, uniform Grant labels), US2 (project Skills tab renders Required/Optional/Available unaffected), US3 (pill correctly showed "1 teams · 1 subscribers · 0 copies" after granting a team; the nonzero-copy case is covered by the automated Testcontainers test T012 instead of live-forking, since the only available test skill was self-owned and self-forking is correctly rejected)
- [X] T024 Confirm via `git diff --stat` against main that no file under `src/app/(app)/projects/` changed, and that `assign-projects-drawer.tsx`/`.test.tsx` are deleted (not merely emptied)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup / Foundational**: N/A — no blocking prerequisite phase.
- **User Story 1 (Phase 3)**: No dependency on US2 or US3 — can start immediately.
- **User Story 2 (Phase 4)**: No dependency on US1 or US3 in terms of *code* (it's pure verification), but should run **after** Phase 3 lands so the regression check (T010) is checking the actual post-removal state, not the pre-removal one.
- **User Story 3 (Phase 5)**: Fully independent of US1/US2 — touches entirely different files (`prompts-repo.ts`, `count-forks-of-skill.ts`, barrel, `CONTRACT.md`) plus one shared file also touched by US1 (`prompt-detail-view.tsx`'s `PromptDetailData` type and the pill) — sequence T018 (US3) after T002 (US1) if working the same file serially, or resolve as a merge if done in parallel.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T004 and T005 (both deletions, independent files) can run in parallel.
- T012 (US3 test) can be written in parallel with any US1 task — different files, no shared dependency.
- T013–T016 (US3 backend chain) are mostly sequential (each depends on the previous), except T016 (CONTRACT.md) which can run in parallel with T017 once T014 lands.
- T021 and T022 (Polish) can run in parallel.

---

## Parallel Example: User Story 1 + User Story 3 (independent files)

```bash
# US1 deletions, in parallel:
Task: "Delete src/app/(app)/prompts/[name]/assign-projects-drawer.tsx"
Task: "Delete src/app/(app)/prompts/[name]/assign-projects-drawer.test.tsx"

# US3 test-first, in parallel with any US1 task:
Task: "Write src/bcs/prompt-registry/application/count-forks-of-skill.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 3 (US1): removal + Share drawer copy/label updates.
2. **STOP and VALIDATE**: confirm one sharing control, correct banner copy, normalized labels.
3. This alone resolves the reported confusion — US2 and US3 are confirmations/enhancements, not required for the core fix to land.

### Incremental Delivery

1. Phase 3 (US1) → validate → this is the MVP.
2. Phase 4 (US2) → validate → confirms zero regression on the project side.
3. Phase 5 (US3) → validate → adds the share-summary enhancement.
4. Phase 6 (Polish) → full-suite verification, quickstart run, diff-scope confirmation.

---

## Notes

- All three user stories, plus every task above, trace directly back to the
  already-approved design (`docs/superpowers/specs/2026-08-14-skill-share-
  drawer-consolidation-design.md`) and spec.md — no open questions remain.
- Commit after each phase (or logical group within a phase) rather than
  one giant commit, per this repo's usual PR-review granularity.
- T013's `countForksOfSkill` must be organization-scoped (Constitution
  Principle IV) — verified by T012's test asserting cross-org isolation.
