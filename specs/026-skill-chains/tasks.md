# Tasks: Skill Chains

**Feature**: 026-skill-chains
**Branch**: `026-skill-chains`
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md) | **Data Model**: [data-model.md](./data-model.md) | **Contract**: [contracts/skill-chains.contract.md](./contracts/skill-chains.contract.md)

---

## Phase 1: Setup

- [X] T001 Verify project environment (Node.js, pnpm, TypeScript, Vitest, Drizzle all configured — existing project, no new setup needed)

---

## Phase 2: Foundational

- [X] T002 [P] Create `src/bcs/prompt-registry/domain/skill-chain.ts` — `ChainStep`, `ChainStepReport`, `ChainStepResolution`, `RunStatus`, `StartRunResult`, `AdvanceRunResult`, `ChainRunSummary`, `ChainRunStepRecord` types; `validateChainSteps(steps)` (dependency-position + duplicate-id validation per `research.md`); `MAX_REPORT_OUTPUT_BYTES = 65536` constant; error classes `InvalidChainDependencyError`, `RunNotFoundError`, `RunAlreadyFinishedError`, `RunStepConflictError`, `NotAChainVersionError`, `ChainStepResolutionFailedError` (FR-011 — system-side resolution failure, distinct from a caller-reported one), `ReportOutputTooLargeError` (FR-014) — all per `data-model.md`/`research.md`
- [X] T003 [P] Extend `src/bcs/prompt-registry/domain/prompt.ts` — `PublishVersionParams` gains `steps?: ChainStep[]`, `PromptVersionSummary` gains `kind: "template" | "chain"` and `steps: ChainStep[] | null`; add `determinePromptVersionKind(params)` + `InvalidVersionShapeError` per `research.md`'s exactly-one-shape rule
- [X] T004 Extend `src/bcs/prompt-registry/infrastructure/schema.ts` — `promptVersions` gains `kind` (text enum `["template","chain"]`, not null, default `'template'`) and `steps` (jsonb, nullable) columns; add `skillChainRuns` and `skillChainRunSteps` tables under `promptRegistrySchema` per `data-model.md`'s exact column list, indexes, and FKs
- [X] T005 Generate the Drizzle migration `0023_prompt_registry_skill_chains.sql` via `MIGRATION_DATABASE_URL="postgresql://x:x@localhost:5432/skillcanon" pnpm db:generate` (CLAUDE.md gotcha), covering T004's schema changes plus RLS (`ENABLE`/`FORCE ROW LEVEL SECURITY` + `CREATE POLICY ... TO skillcanon_app`) on both new tables — direct-column policy for `skill_chain_runs`, `EXISTS`-join-through-`skill_chain_runs` policy for `skill_chain_run_steps`, matching `0019_prompt_registry_rls.sql`'s two patterns exactly. Hand-check against the known missing-snapshot-files gap (`drizzle/migrations/meta/0007,0008,0010,0011,0013_snapshot.json` absent, CLAUDE.md) and trim any bogus re-`CREATE TABLE` statements for already-applied tables before committing; rename the journal `tag` to match. Done now, not deferred to Polish, since every Foundational/US-phase Testcontainers test below needs these tables to exist.
- [X] T006 Create `src/bcs/prompt-registry/infrastructure/skill-chain-runs-repo.ts` — `insert`, `findByIdForUpdate` (`SELECT ... FOR UPDATE`, the row-locking concurrency primitive per `research.md`), `updateStatus` (sets `status`/`currentStepIndex`/`completedAt`), `listByPromptForOrg`, `findByIdForOrg`
- [X] T007 [P] Create `src/bcs/prompt-registry/infrastructure/skill-chain-run-steps-repo.ts` — `insert`, `listByRunId` (ordered by `stepIndex`), `findPendingStep` (by `runId` + `stepIndex`, `reportedStatus IS NULL`), `recordReport` (sets `reportedStatus`/`reportedOutput`/`reportedError` on an existing row)
- [X] T008 Extend `src/bcs/prompt-registry/application/publish-version.ts` — call `determinePromptVersionKind()` (T003) before insert; write `kind`/`steps` on the inserted row; chain `steps` stored exactly as submitted, no existence/cycle validation at publish time (backlog-mandated deferral to run start)
- [X] T009 [P] Extend `src/bcs/prompt-registry/application/publish-version.test.ts` — tests: publishing a chain version stores `steps` verbatim with `kind: "chain"`; a version given both `steps` and `systemTemplate` is rejected (`InvalidVersionShapeError`); a version given neither is rejected; existing template-version publish tests still pass and now assert `kind: "template"`
- [X] T010 Extend `src/bcs/prompt-registry/application/expand.ts` — export `fetchExpandableVersion` (currently private, needed by `start-skill-chain-run.ts`); after resolving a version, reject `kind: "chain"` with `ExpansionSourceNotFoundError` — the same error any other unresolvable version already produces
- [X] T011 [P] Extend `src/bcs/prompt-registry/application/expand-characterization.test.ts` — test: calling `expand()` directly against a published chain version throws `ExpansionSourceNotFoundError`, indistinguishable from a nonexistent skill
- [X] T012 Create `src/bcs/prompt-registry/application/authorize-chain-run-action.ts` — `assertSkillAccessible(db, actor, prompt)`: reuses `listAccessibleByOwnerAndSubscriptions` (no new query logic); throws the existing `PromptNotFoundError` on denial, never a distinguishing error (`research.md`'s authorization decision)
- [X] T013 [P] Create `src/bcs/prompt-registry/application/skill-chain-test-helpers.ts` — shared fixture builder: an org, a chain-owning user/team, and 2-3 dependent template skills to chain together, matching `quickstart.md`'s setup shape — used by every test file in Phases 3-6

---

## Phase 3: User Story 1 — Author and run a multi-step chain (P1)

**Goal**: A caller can start a run of a published chain version and walk it, step by step, receiving each step's correctly governed content in order.

**Independent Test**: Publish a three-step chain (step 2 depending on step 1's result), start a run, report success for each step in turn with a sample result, and confirm each returned step's content is correct and the run finishes marked complete.

- [X] T014 [US1] Create `src/bcs/prompt-registry/application/start-skill-chain-run.ts` — `startSkillChainRun(db, actor, promptName, version?)`: resolve the target version (T010's `fetchExpandableVersion`), reject non-chain with `NotAChainVersionError`; authorize via T012; validate steps via T002's `validateChainSteps`, before any row is written; zero-step chain → insert an already-`"completed"` run row, write the `skill_chain_run.completed` audit event (`withAudit`+`record()`), return `{ runId, done: true }`; otherwise insert the run row (`status: "in_progress"`), resolve step 0 via `expand()` (input `{}` — nothing can precede it), insert the step-0 row, return `{ runId, step }`. **FR-011 (design corrected during implementation — see research.md)**: `db` is always the caller's own outer transaction (`withTenantContext`), so a thrown error here rolls back the whole call — a `resolveChainStep` failure (`ChainStepResolutionFailedError`) therefore leaves **no run row at all**, exactly like `InvalidChainDependencyError`, rather than attempting to separately persist a "failed" status (which the transaction model makes impossible to combine with also throwing)
- [X] T015 [P] [US1] Create `src/bcs/prompt-registry/application/start-skill-chain-run.test.ts` — tests: a 3-step chain's step 1 resolution matches what a direct `expand()` call for that skill/version would produce; a zero-step chain returns `{ runId, done: true }` immediately with one `skill_chain_run.completed` audit event and zero `skill_chain_run_steps` rows; starting a run on a template-kind version throws `NotAChainVersionError`; a caller without access to the chain throws `PromptNotFoundError`; a chain with an invalid dependency throws `InvalidChainDependencyError` **and** creates no `skill_chain_runs` row at all (SC-006); a chain whose step 0 references a nonexistent skill throws `ChainStepResolutionFailedError` **and** creates no run row at all (FR-011, design corrected during implementation — see research.md and T014's note)
- [X] T016 [US1] Create `src/bcs/prompt-registry/application/advance-skill-chain-run.ts` — `advanceSkillChainRun(db, actor, runId, report)`: **before opening any transaction**, if `report.output` exceeds `MAX_REPORT_OUTPUT_BYTES` throw `ReportOutputTooLargeError` with zero state change (FR-014, research.md — reject-not-truncate, checked pre-lock since it can't fail any other way). Then, inside one transaction, `findByIdForUpdate` (row lock); not found or not accessible → `RunNotFoundError`; `status !== "in_progress"` → `RunAlreadyFinishedError`; record `report` onto the pending run-step row; if it was the last step, mark the run `"completed"` (every step succeeded) or `"failed"` (any step ever reported `"error"`), write the matching audit event, return `{ done: true }`; otherwise build the next step's `input` (per `research.md`'s `{ [depId]: { status, output } }` envelope, drawn from every already-resolved run step, not just the one just reported — resolved via `findVersionById(runRow.promptVersionId)`, not re-derived from the skill's current active version), resolve it via `expand()`. **FR-011 (design corrected during implementation)**: a `resolveChainStep` failure propagates and rolls back the whole call — the report just recorded above is undone too, leaving the run exactly as it was before this call (still `in_progress`, same pending step, retryable). On success, insert the resolved step's row, bump `currentStepIndex`, return `{ step }`
- [X] T017 [P] [US1] Create `src/bcs/prompt-registry/application/advance-skill-chain-run.test.ts` — tests: driving a full 3-step chain to completion (reporting `"success"` each time) returns each step's content in order and finishes with `{ done: true }` and `status: "completed"`; step 3's resolved `userMessage` contains step 1's and step 2's real reported `output` (proves the `dependsOn` mapping threads data through non-adjacent steps too); a report with `output` over 64 KB throws `ReportOutputTooLargeError` and leaves the run's `currentStepIndex`/pending step completely unchanged; a cross-org `runId` throws `RunNotFoundError`, the same as a nonexistent one (RLS makes the row invisible, spec Acceptance Criteria's "denied by test (RLS + app-layer)")
- [X] T018 [US1] Extend `src/bcs/prompt-registry/index.ts` — export `startSkillChainRun`, `advanceSkillChainRun`, and the new domain types/errors from T002/T003
- [X] T019 [US1] Extend `src/bcs/prompt-registry/CONTRACT.md` — correct `startSkillChainRun`'s documented return shape to the `{ runId, step } | { runId, done: true }` union (plan.md Complexity Tracking #2); document `ChainStepResolutionFailedError`/`ReportOutputTooLargeError` in the `startSkillChainRun`/`advanceSkillChainRun` rows (FR-011/FR-014, `/speckit-analyze` findings C1/C2)

---

## Phase 4: User Story 2 — A failed step never contaminates later steps (P1)

**Goal**: A step reported as failed never lets a dependent downstream step's resolution show fabricated or stale data, and a run always reaches a well-defined terminal state — including one the caller ends deliberately.

**Independent Test**: Publish a chain where step 3 depends on step 2's result, report step 2 as failed, and confirm step 3's content shows an explicit "unavailable" indicator in place of step 2's result rather than any prior or default value.

- [X] T020 [P] [US2] Extend `advance-skill-chain-run.test.ts` (T017) — tests: reporting step 2 as `"error"` makes step 3's resolved `input` for that dependency exactly `{ status: "error", output: null }` (SC-002), regardless of whether the caller also supplied an `output`/`error` string in the report; a run where every step through the second-to-last succeeded and the final step failed finishes with `status: "failed"`, having still resolved every step (never stopped early)
- [X] T021 [US2] Create `src/bcs/prompt-registry/application/abandon-skill-chain-run.ts` — `abandonSkillChainRun(db, actor, runId, auditContext?)`: same row-lock (`findByIdForUpdate`) and terminal-state check as `advanceSkillChainRun`; on success, sets `status: "abandoned"`, `completedAt`, writes `skill_chain_run.abandoned` transactionally; the pending step row is left with `reportedStatus: null` permanently
- [X] T022 [P] [US2] Create `src/bcs/prompt-registry/application/abandon-skill-chain-run.test.ts` — tests: abandoning an in-progress run sets `status: "abandoned"` and `completedAt`, with one `skill_chain_run.abandoned` audit event; the pending step's `reportedStatus` stays `null` afterward, visible via `getSkillChainRun` (Phase 6) as a distinct "never reported" state; abandoning an already-terminal run throws `RunAlreadyFinishedError`
- [X] T023 [P] [US2] Extend `advance-skill-chain-run.test.ts` — concurrency test: fire two concurrent `advanceSkillChainRun` calls against the same run/step; assert exactly one succeeds and the other throws `RunStepConflictError`, with the run advancing by exactly one step, not two (FR-007a, SC-007); terminal-state test: calling `advanceSkillChainRun` again on an already-`"completed"`/`"failed"`/`"abandoned"` run throws `RunAlreadyFinishedError` rather than silently succeeding (FR-007b, SC-008)
- [X] T024 [US2] Extend `src/bcs/prompt-registry/index.ts` and `CONTRACT.md` — export/document `abandonSkillChainRun` as a 5th Exposed API row (plan.md Complexity Tracking #1); add `SkillChainRunAbandoned` alongside `SkillChainRunCompleted`/`SkillChainRunFailed` in the Events Published table (Complexity Tracking #3)

---

## Phase 5: User Story 3 — Chains inherit sharing and reuse with zero extra setup (P2)

**Goal**: Prove a chain version works with the platform's existing sharing/forking/project-assignment mechanisms without any feature-specific code.

**Independent Test**: Publish a chain version owned by one team, share it with a second team using the platform's existing skill-sharing mechanism, and confirm a member of the second team can start and complete a run of it without any additional configuration.

- [X] T025 [P] [US3] Create `src/bcs/prompt-registry/application/skill-chain-sharing.test.ts` — subscription test: a chain version owned by Team A is shared to Team B via the existing, **unmodified** `subscribeSkill`; a Team B member's `startSkillChainRun` call then succeeds (SC-003) — no changes to `subscribe-skill.ts` needed or made to pass this test
- [X] T026 [P] [US3] Extend `skill-chain-sharing.test.ts` — fork test: `forkSkill` on a chain version creates an independent copy under new ownership; publishing a new version with different `steps` on the fork does not affect the original chain's already-started or future runs
- [X] T027 [P] [US3] Extend `skill-chain-sharing.test.ts` — project-assignment test: `assignSkillToProject` on a chain version succeeds identically to a template version, with no branching on `kind` anywhere in that function (confirmed by this test passing with zero changes to `assign-skill-to-project.ts`)

---

## Phase 6: User Story 4 — Review a run's full history after the fact (P3)

**Goal**: Anyone with access to a chain can retrieve any of its past runs' full step-by-step record without needing to have driven that run live, and without the read itself changing anything.

**Independent Test**: Complete a run, then — using a separate read-only request unrelated to the run itself — retrieve that run's full step-by-step record and confirm it matches exactly what was sent and reported during the live run.

- [X] T028 [US4] Create `src/bcs/prompt-registry/application/list-skill-chain-runs.ts` — `listSkillChainRuns(db, orgId, promptId)`: org-scoped read via `skill-chain-runs-repo.ts`'s `listByPromptForOrg`, most-recent-`startedAt`-first; no `expand()` call, no state transition
- [X] T029 [P] [US4] Create `list-skill-chain-runs.test.ts` — tests: returns every run for a chain in the right order; a different chain's runs are never included; an org with zero runs for that chain returns an empty array, not an error
- [X] T030 [US4] Create `src/bcs/prompt-registry/application/get-skill-chain-run.ts` — `getSkillChainRun(db, orgId, runId)`: returns `{ run, steps }` (steps via `skill-chain-run-steps-repo.ts`'s `listByRunId`) or `null`; pure read
- [X] T031 [P] [US4] Create `get-skill-chain-run.test.ts` — tests: a completed run returns every step's resolved content (`systemMessage`/`userMessage`/`appliedPolicies`/`objectives`) and self-reported outcome (`reportedStatus`/`reportedOutput`/`reportedError`), in order, exactly matching what was produced live (FR-012); calling it twice in a row against an in-progress run returns identical results both times and does not advance `currentStepIndex` (FR-013); a run id belonging to a different organization returns `null` (SC-005), the same shape a nonexistent run id returns — never a distinguishing error
- [X] T032 [US4] Extend `src/bcs/prompt-registry/index.ts` — export `listSkillChainRuns`/`getSkillChainRun`; confirm `CONTRACT.md`'s existing Exposed APIs rows for both are accurate against the shipped signatures (already documented pre-implementation — verify, correct only if drifted)

---

## Phase 7: Polish & Cross-Cutting

- [X] T033 Delete `src/bcs/workflow-orchestration/` entirely (`domain/`, `application/`, `infrastructure/`, `index.ts`, `CONTRACT.md`, `OWNERSHIP.md`) — zero consumers outside this folder, confirmed by repo-wide grep in `research.md`
- [X] T034 Extend `src/shared/db/schemas.ts` — remove the `workflow`/`workflowSchema` export (`SCHEMAS.workflow`, `workflowSchema`)
- [X] T035 Generate the Drizzle migration `0024_drop_workflow_schema.sql` via `pnpm db:generate` (drops `workflow.workflows` and the `workflow` schema itself, now that T033/T034 removed their source) — hand-check against the missing-snapshot-files gotcha the same way as T005
- [X] T036 Update `backlog/008-distribution/004-usage-telemetry.md` — correct the stale "Recorded for every workflow step via `WorkflowRunCompleted`/`WorkflowRunFailed` events" line to reference `SkillChainRunCompleted`/`SkillChainRunFailed`/`SkillChainRunAbandoned`; add a note that this feature wires the Audit side only (`record()` calls) and does not call `distribution.recordPromptUsage` — that link remains unwired for every expansion path in this codebase, not just chains (plan.md Complexity Tracking #4)
- [X] T037 Update `src/bcs/prompt-registry/OWNERSHIP.md` — confirm the `skill_chain_runs`/`skill_chain_run_steps` rows match the actually-shipped column set from `data-model.md`; remove "planned"/forward-looking language now that both tables are real
- [X] T038 Grep `docs/architecture.md` and `docs/context/*.md` for remaining `workflow-orchestration` references implying it's still a live/planned BC; correct any found to reflect PDR-017's retirement (skip if none found — `docs/architecture.md` is already listed as modified in git status from the earlier `as-architect` design pass, so it may already be current; verify rather than assume)
- [X] T039 Run `pnpm typecheck`, `pnpm lint`, and `pnpm vitest run src/bcs/prompt-registry` — all must pass; confirm the workflow-orchestration deletion didn't leave a dangling import anywhere (`pnpm typecheck` across the whole repo, not scoped, at least once)
- [X] T040 Verify against `quickstart.md`'s scenarios — **no live/manual verification was possible or attempted**: this feature has no HTTP route or UI (by design, matching `plan.md`'s Target Platform note — `010-skill-chain-views-ui.md` and `008-distribution` own that layer later), so there is no running-app surface to click through. Every one of `quickstart.md`'s five scenarios (run to completion, failure isolation, invalid-chain rejection, cross-org denial, sharing inherits for free) is instead directly exercised by the automated Testcontainers-backed suite from Phases 2-6, which is the real verification for a BC-layer-only feature: `pnpm typecheck` (repo-wide, clean — confirms the `workflow-orchestration` deletion left no dangling import), `pnpm lint` (clean), `pnpm vitest run src/bcs/prompt-registry` (51 files / 218 tests passing), plus `src/shared/db` and `src/bcs/audit-compliance` (15 files / 63 tests passing, confirming the `schemas.ts` edit didn't regress anything)

---

## Dependencies

```
T002, T003 → T004 (schema needs the shape the domain types describe)
T004 → T005 (migration generated from schema)
T005 → T006, T007 (repos need the tables to exist for their tests)
T003 → T008 → T009
T010 → T011
T012 (standalone, needs only existing listAccessibleByOwnerAndSubscriptions)
T002 → T012 (uses shared error types) — soft dependency, both can start once T002 lands
T006, T007, T008, T010, T012, T013 → T014 (startSkillChainRun composes all of Foundational)
T014 → T015
T014 → T016 → T017
T014...T017 → T018 → T019
T016, T017 → T020 (extends the same test file)
T016 → T021 → T022
T016 → T023
T021, T023 → T024
T014, T016 (chain runs must work at all) → T025, T026, T027
T006, T007 → T028 → T029
T006, T007 → T030 → T031
T028...T031 → T032
T014...T032 → T033 (don't delete workflow-orchestration until the replacement is proven working)
T033, T034 → T035
T033 → T036
T014...T032 → T037
T033 → T038
T002...T038 → T039 → T040
```

## Parallel Execution

Within each phase, tasks marked `[P]` can run in parallel (different files, no dependency on an incomplete sibling task).

Phase 2: T002/T003 in parallel (different files); T007 after T006 lands conceptually but is a different file (marked `[P]`); T009 after T008; T011 after T010; T013 has no dependency on T008-T012, can start as soon as T002/T003 land.
Phase 3: T015 after T014; T017 after T016.
Phase 4: T020/T023 both extend T017's file but touch disjoint test cases — coordinate to avoid edit conflicts rather than truly parallel; T022 after T021.
Phase 5: T025/T026/T027 all extend one new file — same coordination note as above.
Phase 6: T029 after T028; T031 after T030.

## Implementation Strategy

**MVP = Phase 3 (User Story 1) alone.** It alone proves the entire reason this feature exists — a caller can compose and run a multi-step chain end to end — matching spec.md's own framing ("without it, there is no way to compose multiple skills into a runtime sequence at all"). Phases 4-6 are each a genuinely independent, additive correctness/capability layer on top of the same Foundational plumbing: Phase 4 (P1, shipped alongside Phase 3 despite being numbered separately, since both are P1 in spec.md and share almost all of their implementation surface — `advanceSkillChainRun` cannot be built without deciding what a failed step does), Phase 5 (P2, proof-only — no new production code), Phase 6 (P3, pure read layer, unlocks the future `010-skill-chain-views-ui.md`). Phase 7 is required before this branch merges (the retirement of `workflow-orchestration` is this feature's other stated deliverable, not optional cleanup) but has zero bearing on whether the chain-running capability itself works.
