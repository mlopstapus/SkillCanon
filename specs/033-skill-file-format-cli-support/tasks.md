---

description: "Task list for Skill File Format CLI Support"
---

# Tasks: Skill File Format CLI Support

**Input**: Design documents from `/specs/033-skill-file-format-cli-support/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included and non-optional — this repo's constitution (P1) requires a failing test before any new logic; `cli/`'s own fast mocked-HTTP-server + temp-dir test convention (`cli/test/`) is used throughout, unchanged.

**Organization**: Tasks are grouped by user story (spec.md priorities: US1 P1, US2 P1, US3 P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- File paths are exact and relative to repo root, all under `cli/`

---

## Phase 1: Setup

**Purpose**: Nothing new to install — `cli/` already has every dependency this feature needs (Node built-ins only).

- [X] T001 Confirm `cli/` typechecks and tests cleanly on this branch before starting (`pnpm --dir cli run typecheck && pnpm --dir cli test`) — establishes the pre-change baseline.

**Checkpoint**: Baseline green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared type/schema changes every user story's implementation depends on.

**⚠️ CRITICAL**: No user story implementation task can begin until this phase is complete.

- [X] T002 [P] In `cli/src/http/skillcanon-client.ts`: add `activeVersionId: string | null` and `kind: "template" | "chain"` to `SkillSummary`; add `getSkillVersions(options, slug): Promise<SkillVersion[]>` calling `GET /api/skills/[name]/versions` (`SkillVersion` type: `{ id: string; kind: "template" | "chain"; files: Array<{ name: string; content: string; isMain: boolean }> }`, matching `032-skill-file-format-refactor`'s `PromptVersionSummary`/`PromptVersionFile` shape)
- [X] T003 [P] Rename `cli/src/skills/stub.ts` → `cli/src/skills/skill-file.ts`: `renderStub`/`parseStub`/`StubMetadata`/`StubInput` → `renderMainFile`/`parseMainFile`/`SkillFileMetadata`/`MainFileInput` (research.md §3); `deriveSlug` unchanged; add `renderPointerStub(input: MainFileInput): string` (the fixed one-line body, factored out of the old `renderStub` for reuse by the legacy/chain path)
- [X] T003a [P] Rename `cli/test/skills/stub.test.ts` → `cli/test/skills/skill-file.test.ts`: update existing tests to the renamed functions (`renderMainFile`/`parseMainFile`), and add a new test asserting `renderPointerStub`'s output is byte-for-byte identical to today's fixed one-line stub body (depends on T003)
- [X] T004 In `cli/src/config/sync-manifest.ts`: change `SyncManifest.stubs` from `Record<string, string>` to `Record<string, Record<string, string>>`; `readSyncManifest` detects an old-format entry (`typeof value === "string"`) and drops it (treated as absent) per research.md §2
- [X] T005 In `cli/src/skills/reconcile.ts`: change `ReconcileAction` to per-(skill,file) granularity per data-model.md; `planReconciliation` takes a per-skill `SkillContent` (files | pointer-stub, from T002's fetch) instead of bare `name`/`description`, and diffs each skill's desired file set against its tracked file set — including orphaned-file removal (FR-006) and the existing whole-skill `slug-collision` conflict (unchanged, still skill-level)

**Checkpoint**: `pnpm --dir cli run typecheck` fails loudly at every real call site still using the old shapes (`sync.ts`, `agent-docs.ts` if it imports these types, every test file) — expected, this is the worklist for Phase 3+.

---

## Phase 3: User Story 1 - See a skill's real instructions locally, not a pointer sentence (Priority: P1) 🎯 MVP

**Goal**: New-shape skills sync their real main-file + supporting-file content; content updates and orphaned-file removal work correctly across repeated `sync` runs.

**Independent Test**: Publish a skill with a main file and two supporting files; run `skillcanon sync`; confirm the local folder contains all three files with matching content; change the content server-side and re-sync; confirm it updates.

### Tests for User Story 1 ⚠️

- [X] T006 [P] [US1] Failing test: a new-shape skill (main file + 2 supporting files) syncs all three files with matching content, in `cli/test/commands/sync.test.ts`
- [X] T007 [P] [US1] Failing test: a new-shape skill with only a main file (no supporting files) syncs just `SKILL.md`, no empty placeholder files, in `cli/test/commands/sync.test.ts`
- [X] T008 [P] [US1] Failing test: re-running `sync` after the active version's content changes updates the local file(s) to match, in `cli/test/commands/sync.test.ts`
- [X] T009 [P] [US1] Failing test: a supporting file present in the old active version but absent from the new one is deleted locally on the next `sync` (FR-006), in `cli/test/commands/sync.test.ts`
- [X] T010 [P] [US1] Failing test: `getSkillVersions()` correctly locates the entry matching `activeVersionId` out of a multi-version response, in `cli/test/http/skillcanon-client.test.ts`

### Implementation for User Story 1

- [X] T011 [US1] Implement `resolveSkillContent(roster entry, versions)` in `cli/src/commands/sync.ts` (or a small new helper module): branches on `kind`/`files.length` to produce a `SkillContent` (files | pointer-stub) per data-model.md (depends on T002, T003)
- [X] T012 [US1] Rewrite `runSync()` in `cli/src/commands/sync.ts`: for each roster entry, fetch content via T011, call `planReconciliation` (T005) for a per-file plan, apply create/update/remove actions to disk (write main file with frontmatter via `renderMainFile`, supporting files as plain content, remove orphans), update the per-file `SyncManifest` entry (depends on T004, T005, T011)
- [X] T013 [US1] Update `cli/src/integrations/agent-docs.ts`'s `BLURB` text to describe real file-bundle syncing, not the old "opaque pointer" framing (FR-008)
- [X] T014 [US1] Run T006–T010, confirm green

**Checkpoint**: User Story 1 fully functional and independently testable — real content syncs and updates correctly.

---

## Phase 4: User Story 2 - A hand-edit to any synced file is never silently overwritten (Priority: P1)

**Goal**: Per-file drift detection — a hand-edited file is skipped and reported independently of its sibling files in the same skill folder; `--force` overwrites; a deleted (not edited) file is simply recreated.

**Independent Test**: Hand-edit one file in a synced multi-file skill folder; run `sync`; confirm only that file is skipped while its siblings still update; confirm `--force` overwrites it.

**Depends on**: Phase 3 (needs real multi-file syncing to exist before testing partial hand-edit protection across files).

### Tests for User Story 2 ⚠️

- [X] T015 [P] [US2] Failing test: a hand-edited supporting file is skipped and reported as a conflict while an unedited `SKILL.md` in the same folder still updates normally, in `cli/test/commands/sync.test.ts`
- [X] T016 [P] [US2] Failing test: `sync --force` overwrites a previously-skipped hand-edited file, in `cli/test/commands/sync.test.ts`
- [X] T017 [P] [US2] Failing test: a deleted (not edited) synced file is recreated on the next `sync`, never treated as a conflict, in `cli/test/commands/sync.test.ts`
- [X] T018 [P] [US2] Failing test: `planReconciliation` produces independent per-file actions for a skill with one hand-edited and one clean file, in `cli/test/skills/reconcile.test.ts`

### Implementation for User Story 2

- [X] T019 [US2] Confirm/finish per-file hand-edit comparison in `planReconciliation` (T005) — hash each tracked file's current on-disk content against its own `SyncManifest` entry, independent of its siblings
- [X] T020 [US2] Update `registerSyncCommand`'s conflict-reporting loop in `cli/src/commands/sync.ts` to name `<slug>/<filename>` in stderr output, not just the slug (contracts/sync-command.md)
- [X] T021 [US2] Run T015–T018, confirm green

**Checkpoint**: User Stories 1 and 2 both work independently — multi-file sync with correct, independent hand-edit protection per file.

---

## Phase 5: User Story 3 - A skill with no real content to sync still behaves sensibly (Priority: P2)

**Goal**: Chain-kind and legacy-shape skills keep exactly today's pointer-stub behavior, unaffected by and not affecting any other skill in the same sync run.

**Independent Test**: Include one chain-kind and one legacy-shape skill in the roster alongside a new-shape skill; run `sync`; confirm the first two get the unchanged pointer stub and the third gets real content, all in the same run with no errors.

**Depends on**: Phase 2 (T011's branching logic) — this phase is primarily verification of a path already implemented in Phase 3's `resolveSkillContent`.

### Tests for User Story 3 ⚠️

- [X] T022 [P] [US3] Failing test: a chain-kind skill syncs the unchanged one-line pointer stub as `SKILL.md`, no supporting files, in `cli/test/commands/sync.test.ts`
- [X] T023 [P] [US3] Failing test: a template-kind skill with an empty `files` array (legacy-shape) syncs the same unchanged pointer stub, in `cli/test/commands/sync.test.ts`
- [X] T024 [P] [US3] Failing test: a mixed roster (one new-shape, one chain-kind, one legacy-shape skill) syncs all three correctly in one run with no errors, in `cli/test/commands/sync.test.ts`

### Implementation for User Story 3

- [X] T025 [US3] Run T022–T024 against the existing `resolveSkillContent`/`runSync` implementation (T011/T012); no new production code expected per research.md §6 — if any test fails, fix the shape-branch until all pass

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Repo-wide consistency and final validation gates.

- [X] T026 [P] Grep the whole `cli/` package for any remaining `stub.js`/`stub.ts`/`renderStub`/`parseStub` reference missed by T003/T003a (e.g. in `cli/src/index.ts` or other command files that might import from the old path)
- [X] T027 Run `pnpm --dir cli run typecheck`, fix any remaining call site
- [X] T028 Run `pnpm --dir cli test`, confirm full suite green
- [X] T029 Run root `pnpm lint`/`pnpm typecheck` to confirm `cli/`'s exclusion is intact and nothing in the root workspace references any renamed `cli/` export (should be a no-op — `cli/` is a fully independent package, per `029-skill-sync-cli`'s convention — but verify, don't assume)
- [X] T030 Manually execute `quickstart.md` Scenarios 1–4 against a running local server

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Phase 2 only.
- **US2 (Phase 4)**: Depends on Phase 3 (needs real multi-file sync to exist first).
- **US3 (Phase 5)**: Depends on Phase 2's branching logic (built in Phase 3); mostly a verification pass.
- **Polish (Phase 6)**: Depends on all of the above.

### Parallel Opportunities

- T002, T003 (Phase 2) can run in parallel — different files. T003a depends on T003 (same rename).
- T006–T010 (US1 tests) can run in parallel — same file (T006-T009) but independent cases, plus T010 in a different file.
- T015–T018 (US2 tests) can run in parallel.
- T022–T024 (US3 tests) can run in parallel.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 → Phase 2 → Phase 3.
2. **STOP and VALIDATE**: sync a real new-shape skill and confirm its files match the server exactly.

### Incremental Delivery

1. Setup + Foundational → shared types/schema exist.
2. US1 → real content syncs (the core value).
3. US2 → per-file hand-edit protection proven (trust — safe to run `sync` repeatedly/automatically).
4. US3 → no-content skills verified unaffected.
5. Polish → full-suite/manual validation gates before `/as-finish`.

---

## Notes

- [P] tasks touch different files, or the same file with independent test cases.
- Every implementation task in Phases 3–5 has a preceding failing-test task per this repo's constitution (P1).
- `cli/src/commands/sync.ts` is touched by every phase — tasks against it are ordered non-parallel even when not explicitly marked.
- Remediated during `/speckit-analyze` (2026-08-08): T026 originally named the wrong file (`reconcile.test.ts` instead of the actual rename target `stub.test.ts`) — replaced with a repo-wide grep task; added T003a to explicitly rename/update `stub.test.ts`'s own test content (function renames plus new `renderPointerStub` coverage), which the original task list omitted entirely.
