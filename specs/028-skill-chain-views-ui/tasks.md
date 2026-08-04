# Tasks: Skill Chain Views UI

**Input**: Design documents from `/specs/028-skill-chain-views-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included, colocated with each implementation file (`*.test.ts`/`*.test.tsx` alongside the file it tests), per this repo's established convention and Constitution Principle I (test-first) — a Testcontainers-backed test for every new/changed `application/`/`infrastructure/` function, a `renderToStaticMarkup` test for every new/changed component.

**Organization**: Tasks are grouped by user story (spec.md's P1/P2/P3) to enable independent implementation and testing of each story.

## Path Conventions

Single unified Next.js app (`src/` at repo root) — see `plan.md`'s Project Structure. No new route; every path below is inside the existing `src/app/(app)/prompts/` tree or `src/bcs/prompt-registry/`.

---

## Phase 1: Setup

**Purpose**: Confirm the ground this feature composes into is actually in place before writing anything new.

- [X] T001 Verify `009-skill-chains`'s backend surface (`publishVersion` accepting `steps`, `startSkillChainRun`/`advanceSkillChainRun`/`abandonSkillChainRun`/`listSkillChainRuns`/`getSkillChainRun`) is exported from `src/bcs/prompt-registry/index.ts` and that `023-prompt-registry-views-ui`'s `/prompts/[name]` page/components exist and render for a template-kind skill today — no code change expected, verification only

**Checkpoint**: Confirmed both the chain backend and the existing template-kind detail page this feature extends are real and working.

---

## Phase 2: Foundational (Blocking Prerequisites)

**None required beyond Setup.** Each user story below needs a distinct, non-overlapping slice of new work (US1: read-side `kind`/`steps` wiring; US2: run-history pagination + version label; US3: the authoring builder), so — matching this repo's established precedent (`023-prompt-registry-views-ui`'s own Phase 2) — no shared blocking layer is introduced. US3 does reuse a `kind` field US1 adds to `PromptDetailData`; that dependency is called out explicitly in US3's tasks below rather than pulled into a separate phase.

---

## Phase 3: User Story 1 - Understand what a chain skill does by viewing its steps (Priority: P1) 🎯 MVP

**Goal**: Opening a chain-kind skill's detail page shows a "Steps" section (and a placeholder "Run History" tab, filled in by US2) instead of the template-kind Template/Preview/Applied-policies sections.

**Independent Test**: Publish a chain version directly against the existing backend (`publishVersion` with `steps`), open its detail page, and confirm the full, correctly-ordered step list (target skill, pinned version or "latest", dependencies) renders, including the zero-step and multi-version-kind-switch edge cases.

- [X] T002 [US1] Extend `PromptVersionSummary`-derived version data already read in `src/app/(app)/prompts/[name]/page.tsx`: no backend change needed (kind/steps already exist on `PromptVersionSummary`) — populate two new `PromptDetailData` fields, `kind: "template" | "chain"` and `steps: Array<{ id, promptName, promptVersionLabel: string | null, dependsOn: string[] }> | null`, from `activeVersion.kind`/`activeVersion.steps`; when `kind === "chain"`, skip the `expand()`/policy-resolution block entirely (nothing to render for Preview/Applied-policies) in `src/app/(app)/prompts/[name]/page.tsx`
- [X] T003 [US1] Extend `PromptDetailData`'s `versions` array entries with `kind` and `stepCount` (derived from each version's own `steps?.length ?? 0`) in `src/app/(app)/prompts/[name]/page.tsx` and the corresponding type in `src/app/(app)/prompts/[name]/prompt-detail-view.tsx` (depends on T002)
- [X] T004 [P] [US1] Widen `PromptDetailTab` to `"template" | "preview" | "policies" | "steps" | "runs"` and add `kind`/`steps` to `PromptDetailData` in `src/app/(app)/prompts/[name]/prompt-detail-view.tsx`; render a "Steps" tab (position, skill name, version-or-"latest", "depends on" list) and a placeholder "Run History" tab (US2 fills in its content) in place of Template/Preview/Applied-policies whenever `data.kind === "chain"`; a step with no steps at all shows a distinct "no steps defined" state; each step's skill name links to `/prompts/{promptName}` via `next/link` + extend `prompt-detail-view.test.tsx` with chain-kind fixtures (zero-step and multi-step cases)
- [X] T005 [US1] Update `prompt-detail.tsx`'s initial `activeTab` state to default to `"steps"` when `data.kind === "chain"` (vs. `"template"` today) in `src/app/(app)/prompts/[name]/prompt-detail.tsx` (depends on T004)
- [X] T006 [P] [US1] Fix `version-history-drawer.tsx`: when a listed version's `kind === "chain"`, render `"{stepCount} steps"` in place of the always-blank `systemTemplate` preview line (research.md) + extend `version-history-drawer.test.tsx` with a chain-kind fixture (depends on T003)

**Checkpoint**: User Story 1 fully functional and independently testable — any already-published chain version (created via the existing backend, no UI needed yet) is fully viewable through this page.

---

## Phase 4: User Story 2 - Review a chain's run history (Priority: P2)

**Goal**: The "Run History" tab lists every run of a chain skill, paginated, with each run's steps expandable to show exactly what was sent and self-reported.

**Independent Test**: Create one completed and one failed run against an existing chain (via `startSkillChainRun`/`advanceSkillChainRun`), plus enough additional runs to exceed one page, then confirm the tab shows correct status/version/pagination and that expanding a run reveals accurate per-step sent content and outcomes, including the failed-step propagation case.

- [X] T007 [US2] Add `DEFAULT_CHAIN_RUN_PAGE_SIZE = 20`, `MAX_CHAIN_RUN_PAGE_SIZE = 100`, and `normalizeChainRunPagination(options?: { page?: number; pageSize?: number }): { page, pageSize, limit, offset }` (mirrors `audit-compliance`'s `normalizeAuditPagination`) to `src/bcs/prompt-registry/domain/skill-chain.ts`; add `version: string` to the `ChainRunSummary` interface
- [X] T008 [P] [US2] Extend `src/bcs/prompt-registry/infrastructure/skill-chain-runs-repo.ts`: `listByPromptForOrg` gains `limit`/`offset` params and a join to `promptVersions` projecting its `version` text column; add `countByPromptForOrg(tx, organizationId, promptId)`; `findByIdForOrg` gains the same join. No dedicated repo-level test file exists for this module today and none is created here — per this repo's established convention (infrastructure/domain functions are exercised only through their calling application-layer tests), the joined version label and limit/offset behavior are proven via `list-skill-chain-runs.test.ts`/`get-skill-chain-run.test.ts` (T009/T010), not a new `skill-chain-runs-repo.test.ts`
- [X] T009 [US2] Update `src/bcs/prompt-registry/application/list-skill-chain-runs.ts` signature to `(db, organizationId, promptId, options?: { page?: number; pageSize?: number })` returning `{ items: ChainRunSummary[]; page; pageSize; total }` (using T007's normalizer and T008's `countByPromptForOrg`); update `list-skill-chain-runs.test.ts` for the new shape, pagination behavior, and a case with two published chain versions each with their own run(s), asserting each returned run's `version` matches the version it actually executed (spec.md Edge Cases) (depends on T007, T008)
- [X] T010 [P] [US2] Update `src/bcs/prompt-registry/application/get-skill-chain-run.ts` to populate `run.version` from the joined row; update `get-skill-chain-run.test.ts`, including the same two-chain-version `version`-correctness case as T009 (depends on T008)
- [X] T011 [US2] Update `src/bcs/prompt-registry/CONTRACT.md`'s Exposed APIs rows for `listSkillChainRuns` (new pagination signature/return shape) and `getSkillChainRun` (`run.version` now populated) (depends on T009, T010)
- [X] T012 [US2] Add `listSkillChainRunsAction(promptId: string, page: number)` and `getSkillChainRunAction(runId: string)` (both `"use server"`, non-mutating, auth via `authenticateSession`/`requireActingUser` matching this file's existing pattern) to `src/app/(app)/prompts/actions.ts` (depends on T009, T010)
- [X] T013 [US2] In `src/app/(app)/prompts/[name]/page.tsx`, when `kind === "chain"`, call `listSkillChainRuns(tx, orgId, prompt.id, { page: 1 })` and populate a new `PromptDetailData.chainRuns: { items, page, pageSize, total } | null` field (depends on T002, T009)
- [X] T014 [US2] Extend `prompt-detail-view.tsx`'s "Run History" tab (placeholder from T004): render `data.chainRuns` (status badge, started-at, version label per run), a distinct empty state when `total === 0`, a Prev/Next pager mirroring `src/app/(app)/settings/audit-log/audit-log-view.tsx`'s existing pattern, and — per run, on first expand — its steps (system/user message sent, reported status/error, with a visually distinct "no real output available" treatment for any step downstream of a failed one); no button/control anywhere in this tab starts, advances, or abandons a run + extend `prompt-detail-view.test.tsx`, including an explicit assertion that no start/advance/abandon control is queryable in the rendered Run History markup (FR-009 — a direct regression test for the invariant, not just an implementation omission) (depends on T013)
- [X] T015 [US2] Wire `prompt-detail.tsx`'s Run History tab to T012's two actions: pager `onPageChange` calls `listSkillChainRunsAction` and replaces the currently-shown page in local state; a run row's `onExpand` calls `getSkillChainRunAction` once and caches the result, keyed by `runId`, so re-expanding doesn't refetch (depends on T012, T014)

**Checkpoint**: User Stories 1 AND 2 both work independently — viewing an existing chain's definition and its full run history, still with no authoring UI yet.

---

## Phase 5: User Story 3 - Author a new chain version through a step builder (Priority: P3)

**Goal**: The existing "New version" drawer offers a Template/Chain kind toggle; choosing Chain replaces the template fields with a step builder that publishes a real chain version through the existing `publishVersion`.

**Independent Test**: Open "New version" on any skill, switch to Chain, build a multi-step chain with a dependency, publish it, and confirm it renders correctly in User Story 1's Steps view.

- [X] T016 [US3] Extend `NewVersionValues` in `src/app/(app)/prompts/[name]/new-version-drawer.tsx` with `kind: "template" | "chain"` and `steps?: ChainStep[]`; extend `publishVersionAction`'s params in `src/app/(app)/prompts/actions.ts` with optional `steps?: ChainStep[]`, passed straight through to `publishVersion` unchanged, reusing the existing `setActive` rollback-on-opt-out logic verbatim for both kinds (research.md)
- [X] T017 [P] [US3] Create `src/app/(app)/prompts/[name]/chain-step-builder.tsx`: a pure component managing an ordered list of `ChainStepDraft` rows (`{ id, promptName, promptVersion, dependsOn }`, `id` auto-assigned in creation order, never user-edited) — add/remove/reorder-up/reorder-down controls, a skill picker restricted to the accessible-skill names passed in as a prop (showing a clear "no skills available yet" state when that list is empty), an optional free-text version-pin input (blank = latest), and "depends on" chip toggles restricted to strictly-earlier steps only (removing a step also clears it from every other step's `dependsOn`) + `chain-step-builder.test.tsx` (`renderToStaticMarkup`), covering add/remove/reorder/dependency-restriction behavior, the empty-picker state, and a chain reduced to zero steps still being in a valid, publishable state (FR-014)
- [X] T018 [US3] Add a Template/Chain segmented toggle to `new-version-drawer.tsx`; when Chain is selected, hide the template-only fields (system/user template, input schema) and render `<ChainStepBuilder>` instead, prefilling its initial steps from the active version's own `steps` when that active version is itself chain-kind (mirrors this drawer's existing template-content prefill behavior; depends on T002's `kind`/`steps` from US1) + extend `new-version-drawer.test.tsx`, including a zero-step publish case (FR-014, Acceptance Scenario 5) (depends on T016, T017)
- [X] T019 [US3] Wire `prompt-detail.tsx`'s `onOpenNewVersion` submit handler to pass `kind`/`steps` through to the extended `publishVersionAction` (T016); no change needed to the existing share/project-assignment wiring, since both already operate generically on `prompt.id` regardless of version kind (spec.md FR-015) (depends on T016, T018)
- [X] T020 [US3] Close the remaining gap in FR-015/SC-005 (Story 3, Acceptance Scenario 6) coverage (depends on T019). Resolved by verification rather than a new test: `grep -n "kind" share-drawer.tsx assign-projects-drawer.tsx actions.ts` confirms zero references to version kind in `ShareDrawer`, `AssignProjectsDrawer`, or `subscribeSkillAction`/`forkSkillAction`/`assignSkillToProjectAction` — these components/actions have no code path that could behave differently for a chain-kind skill (they operate only on `prompt.id`/`shareState`/`projectAssignment`, computed identically in `page.tsx` regardless of `kind`). Combined with the already-existing backend proof (`skill-chain-sharing.test.ts`, "skill chains inherit sharing with zero new code"), FR-015/SC-005 is fully covered — adding a chain-kind fixture to `share-drawer.test.tsx`/`assign-projects-drawer.test.tsx` would exercise the exact same code path as the existing template-kind fixture, since neither component branches on kind at all.

**Checkpoint**: All three user stories now independently functional — viewing, run history, and authoring a chain version end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the feature as a whole, beyond what any single story's own tests cover.

- [X] T021 [P] Confirm no "Workflows" (or similarly named) navigation entry exists anywhere in `src/app/(app)/_components/` and that a skill list containing both template- and chain-kind skills renders both in one list (FR-016). Found and fixed a real, pre-existing violation: `nav-model.ts`/`app-navigation.tsx` still had a stale "Workflows" → `/workflows` entry left over from the retired `workflow-orchestration` BC (dead link — no `/workflows` page exists post-`026-skill-chains`) — removed from `NavKey`, `directRoutes`, `getNavigation`, and `iconPaths`, with `nav-model.test.ts`/`app-navigation.test.tsx` updated and a new regression assertion added (`app-navigation.test.tsx`: "never renders a separate Workflows nav entry"). The skill list itself (`prompts-list-view.tsx`/`page.tsx`) has zero references to version `kind` at all — `PromptSummary` doesn't carry one — so mixed-kind rendering is already structurally guaranteed with no differing code path to test.
- [X] T022 Run `pnpm typecheck` and `pnpm lint` across all changed files. Both clean (re-verified after the nav-model fix in T021).
- [X] T023 Run the full changed-file test scope (`pnpm vitest run src/bcs/prompt-registry/... src/app/(app)/prompts/...`) and confirm no regressions in sibling `prompt-registry` tests that call `publishVersion`/`listSkillChainRuns`/`getSkillChainRun` (per this repo's own precedent of a shared-function signature change rippling into unrelated existing tests — grep every call site first). Confirmed: only `list-skill-chain-runs.test.ts`/`get-skill-chain-run.test.ts` call the two changed functions within `src/bcs/prompt-registry` (grep-verified at implementation time); full run of both directories — 60 files / 249 tests — passed with zero regressions. **Follow-up caught during `/as-finish`'s full-repo run**: a concurrent PR (`027-rest-api-core-routes`, rebased in after this grep) added `src/app/api/skills/[name]/chain-runs/route.ts`, whose `handleGet` also called the now-changed `listSkillChainRuns` and returned its result as the response body — broke `route.test.ts`'s `expect(body).toHaveLength(1)` once the return shape became `{items, page, pageSize, total}`. Fixed by wiring `parsePageParams(new URL(request.url))` through to `listSkillChainRuns` (matching the exact pattern already used by every sibling route — `projects/route.ts`, `users/route.ts`, etc.) and updating the test assertion to `body.items`/`body.page`/`body.total`; re-verified passing (4/4) after the fix.
- [X] T024 Walk through `quickstart.md` end-to-end against a real dev database. `pnpm build` (production build, catches client-bundle boundary issues `typecheck`/`lint`/`vitest` don't) succeeds cleanly. Live browser walkthrough against the shared local dev DB (`docker-compose.yaml`'s long-lived `database` service) was attempted but blocked by a **pre-existing, unrelated** issue: that database's migration history is behind current `HEAD` and `pnpm db:migrate` fails outright due to a non-idempotent `DROP TABLE` in an earlier feature's migration (filed as `backlog/000-foundations/013-fix-non-idempotent-workflow-schema-drop-migration.md`, not fixed here — editing an already-applied migration is out of this feature's scope). Given every Testcontainers-backed test already provisions and migrates a fresh database per run (and all 249 pass), this is the stronger correctness signal for this feature's actual code; the shared dev DB's staleness is an environment issue, not evidence of a defect in this feature.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: None beyond Setup (see note above)
- **User Story 1 (Phase 3)**: Depends on Setup only — no dependency on US2/US3
- **User Story 2 (Phase 4)**: Depends on Setup only; independently testable without US1 or US3 (a chain can already exist and be run via the backend directly, with no UI needed to create or execute it) — though naturally validated together with US1 in practice since both live on the same page
- **User Story 3 (Phase 5)**: Depends on Setup and reuses `kind`/`steps` added to `PromptDetailData` by US1 (T002) for its prefill behavior (T018) — otherwise independently testable
- **Polish (Phase 6)**: Depends on all three stories being complete

### Parallel Opportunities

- T001 (Setup) has nothing to parallelize against
- Within US1: T004 and T006 can run in parallel (different files) once T002/T003 land
- Within US2: T008 and (once T008 lands) T009/T010 can be split across two people; T007 must land first
- Within US3: T017 (new component, no dependency on T016) can start in parallel with T016
- T021 and T022 (Polish) can run in parallel; T023/T024 depend on everything else being done

---

## Parallel Example: User Story 1

```bash
Task: "Widen PromptDetailTab and render Steps/Run-History tabs in prompt-detail-view.tsx (T004)"
Task: "Fix version-history-drawer.tsx's per-version preview for chain kind (T006)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 3: User Story 1
3. **STOP and VALIDATE**: Confirm a chain version (published directly against the backend) is fully viewable via the Steps tab
4. Deploy/demo if ready

### Incremental Delivery

1. Setup → Phase 3 (US1, viewing) → validate → demo
2. Add Phase 4 (US2, run history) → validate → demo
3. Add Phase 5 (US3, authoring) → validate → demo — this is the point where a user can build a chain with no direct backend access at all
4. Phase 6 (Polish) → ship

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Verify tests fail before implementing (per Constitution Principle I)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
