# Tasks: Usage Telemetry

**Feature**: 001-usage-telemetry
**Branch**: `001-usage-telemetry`
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md) | **Data Model**: [data-model.md](./data-model.md) | **Contract**: [contracts/usage-telemetry.contract.md](./contracts/usage-telemetry.contract.md)

---

## Phase 1: Setup

- [X] T001 Verify project environment is the existing TypeScript/Next.js/Drizzle/Vitest app; no dependency install required in `package.json`

---

## Phase 2: Foundational

**Purpose**: Extend the telemetry storage and Distribution read/write services before route/page integration.

- [X] T002 [P] Extend `src/bcs/distribution/domain/prompt-usage.ts` with runtime telemetry fields, org summary types, and record params for status/latency/git context
- [X] T003 Extend `src/bcs/distribution/infrastructure/schema.ts` with `prompt_version`, `status_code`, `latency_ms`, `git_remote_url`, `git_branch`, and `git_commit_sha` columns plus organization/time indexes
- [X] T004 Create `drizzle/migrations/0025_distribution_usage_telemetry.sql` for T003's additive schema changes
- [X] T005 Extend `src/bcs/distribution/infrastructure/prompt-usage-repo.ts` to insert new fields and query organization-scoped aggregates by bounded window, status, skill/version, and day
- [X] T006 Extend `src/bcs/distribution/application/record-prompt-usage.ts` to preserve the no-audit write contract while accepting runtime telemetry fields
- [X] T007 [P] Add/extend `src/bcs/distribution/application/record-prompt-usage.test.ts` with failing tests for status/latency/git-context inserts and historical nullable compatibility
- [X] T008 [P] Create `src/bcs/distribution/application/get-prompt-usage-summary-for-organization.test.ts` with failing tests for zero state, aggregate counts, latency summaries, time windows, and cross-org isolation
- [X] T009 Create `src/bcs/distribution/application/get-prompt-usage-summary-for-organization.ts` and export it from `src/bcs/distribution/index.ts`

**Checkpoint**: Distribution can store and summarize runtime usage independently of route wiring.

---

## Phase 3: User Story 1 - Record real skill expansion telemetry (P1) MVP

**Goal**: Every genuine authenticated REST expansion writes exactly one usage row, including Skill Sync CLI calls through the same REST path.

**Independent Test**: Call `POST /api/skills/{name}/expand` for a published skill and verify one row with org, skill, version, user/project, status, latency, and optional git context; call preview/app detail expansion and verify no row.

### Tests

- [X] T010 [P] [US1] Extend `src/app/api/skills/[name]/expand/route.test.ts` with failing tests for successful REST usage row, failure telemetry after visible skill/version resolution, git-context body fields, and no row on unauthenticated/unknown-skill requests
- [X] T011 [P] [US1] Extend `src/bcs/prompt-registry/application/expand.test.ts` or existing preview coverage to confirm direct preview/test `expand()` still creates zero `prompt_usage` rows

### Implementation

- [X] T012 [US1] Extend `src/app/api/skills/[name]/expand/route.ts` to parse optional git context, resolve the visible version, measure elapsed time, call `expand()`, and record exactly one successful usage row
- [X] T013 [US1] Ensure failed REST expansion after visible skill/version resolution records a status/latency row without storing error details in `src/app/api/skills/[name]/expand/route.ts`

**Checkpoint**: REST and Skill Sync through REST produce telemetry; preview/test remains excluded.

---

## Phase 4: User Story 2 - Record skill-chain terminal step telemetry (P2)

**Goal**: Accepted completed/failed skill-chain step reports create usage rows without fabricating abandoned or invalid steps.

**Independent Test**: Start a chain, advance a step with `success`, advance another terminal report with `error`, and verify one usage row per accepted reported step in the caller's organization.

### Tests

- [X] T014 [P] [US2] Extend `src/app/api/chain-runs/[runId]/advance/route.test.ts` with failing tests for success and error step usage rows
- [X] T015 [P] [US2] Extend `src/app/api/chain-runs/[runId]/advance/route.test.ts` with failing tests proving stale/invalid reports and abandoned/unreported steps do not create usage rows

### Implementation

- [X] T016 [US2] Add a prompt-registry read/export for the pending run step's resolved prompt/version identity needed by telemetry
- [X] T017 [US2] Extend `src/app/api/chain-runs/[runId]/advance/route.ts` to read pending step identity, measure latency, call `advanceSkillChainRun()`, and record one usage row for accepted success/error reports

**Checkpoint**: Chain terminal-step telemetry works independently of REST expansion telemetry.

---

## Phase 5: User Story 3 - View organization usage aggregates (P3)

**Goal**: Organization admins can fetch and view aggregate usage with no cross-org leakage.

**Independent Test**: Seed usage for two organizations, request metrics as one org, and confirm totals/status/skill/version/latency/window aggregates contain only that org's rows; open `/metrics` with no rows and with rows.

### Tests

- [X] T018 [P] [US3] Create `src/app/api/metrics/route.test.ts` with failing tests for zero state, aggregate response, bounded window validation, entitlement gate, and cross-org isolation
- [X] T019 [P] [US3] Create `src/app/(app)/metrics/metrics-page.test.tsx` with failing render tests for zero-usage and populated aggregate states

### Implementation

- [X] T020 [US3] Create `src/app/api/metrics/route.ts` using `withApiRoute`, `assertCoreFeaturesEnabled`, query validation, and `getPromptUsageSummaryForOrganization()`
- [X] T021 [US3] Create `src/app/(app)/metrics/page.tsx` to render authenticated org-scoped usage totals, status breakdown, skill/version breakdown, latency summaries, and empty state

**Checkpoint**: Metrics endpoint/page expose organization-scoped telemetry with no cross-org leakage.

---

## Phase 6: Polish & Cross-Cutting

- [X] T022 [P] Update `src/bcs/distribution/CONTRACT.md` and `src/bcs/distribution/OWNERSHIP.md` for the shipped column set, REST/chain write semantics, org summary API, git-context retention note, and deferred MCP parity
- [X] T023 [P] Update `specs/001-usage-telemetry/quickstart.md` if implementation commands differ from the planned verification commands
- [X] T024 Run targeted tests: `corepack pnpm vitest run src/bcs/distribution 'src/app/api/skills/[name]/expand' 'src/app/api/chain-runs/[runId]/advance' src/app/api/metrics 'src/app/(app)/metrics'`
- [X] T025 Run finish checks: `corepack pnpm typecheck`, `corepack pnpm lint`, and `corepack pnpm test` or the project finish pipeline equivalent

---

## Dependencies

```text
T001 -> T002, T003
T002, T003 -> T004, T005, T006
T005, T006 -> T007, T008, T009
T007, T008, T009 -> T010, T011, T012, T013
T009 -> T014, T015, T016, T017
T009 -> T018, T019, T020, T021
T012, T013 -> T014, T017 (shared telemetry helper shape)
T016 -> T017
T020 -> T021
T010...T021 -> T022, T023, T024, T025
```

## Parallel Execution

Tasks marked `[P]` can proceed in parallel when they touch different files. Test tasks within a story are parallelizable before the implementation task for that story. Route implementation tasks should be sequenced after Distribution's storage/query functions are complete.

## Implementation Strategy

MVP first is Phase 3 after the foundational telemetry storage is complete: it proves the core usage-capture requirement for REST and Skill Sync via REST. Phase 4 adds chain-step parity using the same recording service. Phase 5 makes the data externally visible through org-scoped aggregate metrics. Phase 6 is required before review.
