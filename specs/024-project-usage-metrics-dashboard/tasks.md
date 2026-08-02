# Tasks: Project Usage Metrics Dashboard

**Feature**: 024-project-usage-metrics-dashboard
**Branch**: `024-project-usage-metrics-dashboard`
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md) | **Data Model**: [data-model.md](./data-model.md)

---

## Phase 1: Setup

- [ ] T001 Verify project environment (Node.js, pnpm, TypeScript, Vitest, Drizzle all configured — existing project, no new setup needed)

---

## Phase 2: Foundational

- [X] T002 Create `src/bcs/distribution/domain/prompt-usage.ts` — `RecordPromptUsageParams`, `PromptUsageSummaryForProject`, `GetPromptUsageSummaryForProjectOptions` types per `data-model.md`
- [X] T003 Create `src/bcs/distribution/infrastructure/schema.ts` — first file in this BC's `infrastructure/` (currently `.gitkeep`-only): `promptUsage` table under `distributionSchema` per `data-model.md`'s column list (`id`, `organization_id`, `prompt_id`, `prompt_version_id`, nullable `project_id`, nullable `user_id`, `created_at` — no `updated_at`, no FKs per this repo's no-cross-schema-FK convention), with indexes on `(project_id, created_at)`, `(project_id, prompt_id)`, `(project_id, user_id)`
- [X] T004 Create `src/bcs/distribution/infrastructure/prompt-usage-repo.ts` — raw Drizzle queries: `insert`, `countTotalForProject`, `listSinceForProject`, `listGroupedBySkillForProject`, `listGroupedByMemberForProject`, `listDailyCountsBySkillForProject` (research.md's bounded-query decision — no unbounded all-time row fetch)
- [X] T005 Create `src/bcs/distribution/application/record-prompt-usage.ts` — `recordPromptUsage(db, params)`: thin wrapper over `insert`, returns `void`, no `withAudit` wrap (usage telemetry is explicitly distinct from the audit trail — contract obligation 2)
- [X] T006 [P] Create `src/bcs/distribution/application/record-prompt-usage.test.ts` — tests: inserts a row with all fields populated; inserts successfully with nullable `projectId`/`userId`; a row is retrievable via a direct repo query scoped to its own `organizationId`/`projectId`
- [X] T007 Create `src/bcs/distribution/application/get-prompt-usage-summary-for-project.ts` — `getPromptUsageSummaryForProject(db, organizationId, projectId, options)`: composes T004's five repo queries into one `PromptUsageSummaryForProject`, scoped throughout by both `organizationId` and `projectId`
- [X] T008 [P] Create `src/bcs/distribution/application/get-prompt-usage-summary-for-project.test.ts` — tests: empty project returns `{ totalInvocations: 0, windowRows: [], bySkill: [], byMember: [], dailyCountsBySkill: [] }`, never an error; seeded usage (via T005) produces correct `totalInvocations`/`windowRows`/`bySkill`/`byMember`/`dailyCountsBySkill`; a null-`userId` row appears correctly in `byMember`'s grouping; **a row seeded with `projectId: null` (ad hoc usage) never appears in any other project's summary** (spec FR-002, `/speckit-analyze` finding C2); **negative cross-org test**: a row recorded under org A is invisible when calling with org B's `organizationId`, even given the same `projectId` (Constitution IV)
- [X] T009 Extend `src/bcs/distribution/index.ts` (currently `export {};`) — export `recordPromptUsage`, `getPromptUsageSummaryForProject`, and the domain types from T002
- [X] T010 Extend `src/bcs/distribution/CONTRACT.md` — add `recordPromptUsage`/`getPromptUsageSummaryForProject` to the Exposed APIs table; correct the "Events Consumed" `PromptExpanded` row to reflect the real direct-call implementation (no event bus exists anywhere in this codebase), matching the note already added to `backlog/008-distribution/004-usage-telemetry.md` during `/speckit-clarify`
- [X] T011 Extend `src/bcs/distribution/OWNERSHIP.md` — update the `distribution.prompt_usage` row to the actual shipped column set (data-model.md), noting the divergence from `004-usage-telemetry.md`'s originally-planned `prompt_name`/`prompt_version`/`status_code`/`latency_ms` columns
- [X] T012 Extend `src/bcs/prompt-registry/application/expand.test.ts` — add a regression test asserting `expand()` produces **no** new `distribution.prompt_usage` row: call `distribution.getPromptUsageSummaryForProject` before and after invoking `expand()` (with a real `projectId`/`userId` context) and assert `totalInvocations` is unchanged. Codifies FR-002a and `quickstart.md` Scenario 4 as a permanent, automated guard (`/speckit-analyze` finding C1) — without this, a future PR could silently wire `expand()` into `recordPromptUsage` with nothing to catch the regression

---

## Phase 3: User Story 1 — See whether a project's required skills are actually being used (P1)

**Goal**: The four summary tiles (total invocations, active skills, active contributors, required-skill coverage) render real, correctly-computed values.

**Independent Test**: Seed usage across several skills/members in a project with one required skill; call `getProjectMetrics` directly and confirm each tile value; confirm a project with no required skills shows a neutral coverage state, not `0%`.

- [X] T013 [US1] Create `src/bcs/prompt-registry/application/get-project-metrics.ts` — `getProjectMetrics(db, organizationId, projectId)`: calls `distribution.getPromptUsageSummaryForProject(db, organizationId, projectId, { activeWindowDays: 30, trendDays: 14 })`, existing `listProjectMembers`, existing `listProjectSkillAssignmentsForOrganization` (filtered to this `projectId`, matching `page.tsx`'s existing filter pattern); computes `totalInvocations`, `activeSkillCount` (distinct `promptId` in `windowRows`), `activeContributorCount` (distinct non-null `userId` in `windowRows`), `requiredSkillIds`, `coverageLabel`/`hasCoverageGap` (skill-level ratio — research.md). Defines the full `ProjectMetrics` interface now (per `data-model.md`); `gapMembers`/`allClear`/`bySkill`/`byMember`/`trend` return correct-but-empty defaults until Phases 4–5 fill them in for real
- [X] T014 [P] [US1] Create `src/bcs/prompt-registry/application/get-project-metrics.test.ts` — tests: seeded usage produces correct `totalInvocations`/`activeSkillCount`/`activeContributorCount`; `coverageLabel` reflects the skill-level ratio (spec Acceptance Scenario 1.2, e.g. "1/2"); a project with no required skills → `coverageLabel: "—"` (Acceptance Scenario 1.3); an empty project → all zeros, no error. Optional (`/speckit-analyze` finding C3, non-blocking): consider one direct negative cross-org test here too, for defense-in-depth alongside T008's
- [X] T015 [US1] Extend `src/bcs/prompt-registry/index.ts` and `CONTRACT.md` to export/document `getProjectMetrics` (documented now; description extended again in Phases 4–5 as the return shape grows)
- [X] T016 [US1] Extend `src/app/(app)/projects/[id]/project-detail-view.tsx` — add `"metrics"` to the `ProjectDetailTab` union, add "Metrics" to the tab bar, render the four summary tiles from `data.metrics` (coverage tile shows `"—"` when `requiredSkillIds` is empty, per `contracts/project-usage-metrics-dashboard.contract.md`'s UI-state table)
- [X] T017 [P] [US1] Extend `src/app/(app)/projects/[id]/project-detail-view.test.tsx` — render with `activeTab: "metrics"` and both populated and no-required-skills `metrics` fixtures; assert correct tile values and the `"—"` coverage state (this repo's always-render-all-tabs testing convention — no simulated tab clicks)
- [X] T018 [US1] Extend `src/app/(app)/projects/[id]/page.tsx` — call `getProjectMetrics` alongside the existing `Promise.all`, map the tile-relevant fields into a new `metrics` field on `ProjectDetailData`

---

## Phase 4: User Story 2 — Find exactly who isn't using a required skill (P2)

**Goal**: The gap panel lists every project member missing a required skill, by name; an all-clear state shows when nobody is missing anything.

**Independent Test**: A member who hasn't used a required skill in the window appears in the gap panel with the correct missing skill; when every member is current, an all-clear message renders instead; a member with zero activity at all still appears as a gap on every required skill.

- [X] T019 [US2] Extend `get-project-metrics.ts` — add `gapMembers`/`allClear` computation (member-level, per `data-model.md` step 6): for each project member, `missingSkillIds` = `requiredSkillIds` not used by that member within the 30-day window; a member is a gap iff `requiredSkillIds` is non-empty and their `missingSkillIds` is non-empty; `allClear` iff `requiredSkillIds` is non-empty and `gapMembers` is empty
- [X] T020 [P] [US2] Extend `get-project-metrics.test.ts` — tests: a member missing a required skill appears in `gapMembers` with the correct `missingSkillIds`; every member current → `allClear: true`, `gapMembers` empty; a member with zero recorded activity at all still flagged as a gap on every required skill (Acceptance Scenario 2.3); adding this fully-inactive member does **not** change T014's `coverageLabel` assertions (proves tile/gap independence — research.md, quickstart.md Scenario 3)
- [X] T021 [US2] Extend `project-detail-view.tsx` — render the gap panel (member name + missing skill names) when `gapMembers` is non-empty, the all-clear message when `allClear`, and render neither when `requiredSkillIds` is empty (not applicable — distinct from "no gaps", per the contract's UI-state table)
- [X] T022 [P] [US2] Extend `project-detail-view.test.tsx` — cover gap-panel-populated, all-clear, and not-applicable (no required skills) states
- [X] T023 [US2] Extend `page.tsx` — resolve `gapMembers`' `userId`s to display names via the already-fetched `allUsers`/`userNameById` map, and `requiredSkillIds`/`missingSkillIds` to skill names via the already-fetched skill list — same pattern already used for the Members/Prompts tabs

---

## Phase 5: User Story 3 — Understand usage trends and breakdowns (P3)

**Goal**: A 14-day stacked-bar trend (one segment per skill) and all-time by-skill/by-member tables render correctly.

**Independent Test**: Seed usage across three skills spread over several of the last 14 days; confirm the trend has one bar per day with correctly-proportioned per-skill segments, including a zero-height bar for a day with no invocations; confirm the by-skill/by-member tables show correct counts and last-used/last-active dates.

- [X] T024 [US3] Extend `get-project-metrics.ts` — add `bySkill`/`byMember`/`trend` computation from the summary's `bySkill`/`byMember`/`dailyCountsBySkill` (joining `requirement` onto each `bySkill` row from the assignment map; zero-filling all 14 `trend` days per `data-model.md` step 7)
- [X] T025 [P] [US3] Extend `get-project-metrics.test.ts` — tests: `bySkill`/`byMember` rows match seeded counts and last-used/last-active dates, including the null-`userId` "no user" bucket in `byMember`; `trend` has exactly 14 entries with correct per-skill counts; a day with zero invocations still appears with an empty `countsByPromptId` rather than being omitted (Acceptance Scenario 3.2)
- [X] T026 [US3] Create `src/app/(app)/projects/[id]/project-metrics-trend-chart.tsx` — pure presentational stacked-bar component: takes 14 `{ day, countsByPromptId }` entries plus a skill-id → `{ name, color }` map, renders one bar per day with per-skill stacked segments (isolated per `plan.md`'s Structure Decision)
- [X] T027 [P] [US3] Create `src/app/(app)/projects/[id]/project-metrics-trend-chart.test.tsx` — tests: renders 14 bars; an all-zero day renders an empty/zero-height bar rather than being omitted; segment proportions match input counts
- [X] T028 [US3] Extend `project-detail-view.tsx` — render `project-metrics-trend-chart.tsx` plus the by-skill and by-member tables, each with its own independent empty state per the contract's UI-state table
- [X] T029 [P] [US3] Extend `project-detail-view.test.tsx` — cover by-skill/by-member populated and empty states
- [X] T030 [US3] Extend `page.tsx` — resolve `bySkill`/`byMember`'s ids to display names/requirement labels, same pattern as T023

---

## Phase 6: Polish & Cross-Cutting

- [X] T031 Generate the Drizzle migration for `distribution.prompt_usage` — **done early (during Phase 2), not deferred to Polish**, since Phase 2's own Testcontainers tests required the table to exist to pass. Generated as `0022_distribution_prompt_usage.sql` (renamed from drizzle-kit's auto-generated `0022_crazy_greymalkin.sql`); hand-trimmed the bogus `workflow.workflows` re-creation DDL that `db:generate` bundled in due to this repo's known missing-snapshot-files gap (`0007`/`0008`/`0010`/`0011`/`0013`, per `backlog/000-foundations/011-fix-missing-migration-snapshot-files.md`); journal `tag` renamed to match; `when` (1785615112424) is later than `0021`'s, in order; no collision with `main` (confirmed via `git fetch origin main` — no new commits since branch base)
- [X] T032 File a new backlog item under `backlog/008-distribution/` tracking the no-RLS gap on `distribution.prompt_usage` (plan.md Complexity Tracking item 2) — matches `prompt_registry`'s own precedent of a dedicated future tenant-isolation item, so this gap isn't silently lost
- [X] T033 Run `pnpm typecheck`, `pnpm lint`, and `pnpm vitest run src/bcs/distribution src/bcs/prompt-registry "src/app/(app)/projects"` — all pass: typecheck clean, lint clean, 55 test files / 221 tests passing
- [X] T034 Manually verify via the running app — **partially completed, documented honestly rather than claimed in full**: a `next dev` server was already running on :3001 from an earlier session. Confirmed the register page correctly shows "FIRST-RUN SETUP" for a genuinely empty instance, then confirmed the single-org guard correctly rejects a second registration attempt ("This instance is already set up") once real org state exists — proving that guard works as designed. Could not proceed to an authenticated view of the Metrics tab itself: the existing org's credentials are unknown, and guessing/brute-forcing them would be inappropriate. Real verification for this feature rests on the 221 passing automated tests across `src/bcs/distribution`, `src/bcs/prompt-registry`, and `src/app/(app)/projects` (T033), including `renderToStaticMarkup` coverage of every UI state (populated tiles, no-required-skills, gap panel, all-clear, not-applicable, populated/empty trend and tables) — not a substitute for live verification, but the closest available given the circumstances.

---

## Dependencies

```
T002 → T003, T004 (domain types needed by schema/repo)
T003 → T004 (schema needed by repo queries)
T004 → T005, T007
T005 → T006
T007 → T008
T005, T007 → T012 (regression test needs both recordPromptUsage and the summary query to exist)
T002...T008 → T009 → T010 → T011 (barrel/docs after implementation lands)
T009, T012 → T013 (getProjectMetrics calls distribution's exported functions)
T013 → T014
T013 → T015 → T016 → T017
T016 → T018 (page.tsx maps data the view now expects)
T013 → T019 (gap computation extends the same function)
T019 → T020
T019 → T021 → T022
T021 → T023
T019 → T024 (trend/table computation extends the same function again)
T024 → T025
T024 → T026 → T027
T026 → T028 → T029
T028 → T030
T013...T030 → T031 → T032 → T033 → T034
```

## Parallel Execution

Within each phase, tasks marked `[P]` can run in parallel (different files).

Phase 2: T006 after T005; T008 after T007; T012 after T005/T007 — T002/T003/T004 are sequential (each depends on the prior), but T005/T007 (and their tests) can be developed in parallel once T004 lands, since `record-prompt-usage.ts` and `get-prompt-usage-summary-for-project.ts` don't depend on each other.
Phase 3: T014 after T013; T017 after T016.
Phase 4: T020 after T019; T022 after T021.
Phase 5: T025 after T024; T027 after T026; T029 after T028.

## Implementation Strategy

**MVP = Phase 3 (User Story 1) alone.** Unlike `022-project-skill-assignment`'s three tightly-coupled P1 stories, this feature's three stories are priority-ordered (P1/P2/P3) and each is a genuinely separable increment of the *same* underlying `getProjectMetrics` function: US1 (tiles) already delivers the core value proposition — "can a project lead tell whether governance is working" (spec User Story 1's own "Why this priority") — with no gap panel or trend/tables required. US2 (gap panel) and US3 (trend + tables) are each an independently shippable extension layered on top, in priority order, matching spec.md's own P1/P2/P3 framing exactly.
