---

description: "Task list for Skill File Format Refactor"
---

# Tasks: Skill File Format Refactor

**Input**: Design documents from `/specs/032-skill-file-format-refactor/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included and non-optional — this repo's constitution (P1, "Test-First Development") requires a failing test before any new backend logic; UI components follow this repo's established `renderToStaticMarkup` structural-test convention.

**Organization**: Tasks are grouped by user story (spec.md priorities: US1 P1, US2 P1, US4 P1, US3 P2 — P1 stories ordered first, matching spec.md's own numbering where it doesn't conflict).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- File paths are exact and relative to repo root

---

## Phase 1: Setup

**Purpose**: Schema definition for the new table — the literal starting point every other task depends on.

- [x] T001 Add `promptVersionFiles` table to `src/bcs/prompt-registry/infrastructure/schema.ts` per data-model.md (`id`, `promptVersionId` FK → `promptVersions.id` `ON DELETE CASCADE`, `name`, `content`, `isMain`, `createdAt`; `unique(promptVersionId, name)`); drop the `inputSchema` column from the `promptVersions` table definition in the same file
- [x] T002 Generate the Drizzle migration (`MIGRATION_DATABASE_URL="postgresql://x:x@localhost:5432/skillcanon" pnpm db:generate`), hand-trim per the known missing-snapshot-files gap (CLAUDE.md), rename to `<timestamp>_prompt_registry_skill_files.sql`, and add RLS `ENABLE`/`FORCE`/`CREATE POLICY` statements for `prompt_version_files` using the `EXISTS`-through-`prompt_versions` pattern from `drizzle/migrations/0019_prompt_registry_rls.sql` in `drizzle/migrations/`

**Checkpoint**: Schema + migration exist; `pnpm db:migrate` succeeds locally.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain types, repo functions, error registration, and the constitution-mandated tenant-isolation proof that every user story's implementation calls into or must not violate.

**⚠️ CRITICAL**: No user story implementation task can begin until this phase is complete.

- [x] T003 In `src/bcs/prompt-registry/domain/prompt.ts`: add `PromptVersionFile` interface; add `files: PromptVersionFile[]` to `PromptVersionSummary`; replace `PublishVersionParams`'s `systemTemplate`/`userTemplate`/`inputSchema` with `mainFile?: { content: string }` and `supportingFiles?: Array<{ name: string; content: string }>`; update `determinePromptVersionKind` to check `mainFile` vs `steps`; add `InvalidVersionFilesError`
- [x] T004 [P] In `src/bcs/prompt-registry/domain/expansion.ts`: remove `input` from `ExpandParams`; replace `ExpansionResult`'s `systemMessage`/`userMessage` with a single `content: string`
- [x] T005 [P] Create `src/bcs/prompt-registry/infrastructure/prompt-version-files-repo.ts`: `insertFiles(tx, promptVersionId, files: Array<{name, content, isMain}>)` and `listFilesByVersionId(db, promptVersionId)`
- [x] T006 Update `src/bcs/prompt-registry/infrastructure/prompt-versions-repo.ts`: version-read functions join/attach `files` (via T005's `listFilesByVersionId`) onto every returned `PromptVersionSummary`
- [x] T007 [P] Register `InvalidVersionFilesError` → `422 INVALID_SKILL_VERSION_FILES` in `src/shared/api/errors.ts`, alongside the existing `InvalidVersionShapeError` entry
- [x] T008 [P] Add a `describe("prompt_version_files", ...)` block to `src/bcs/prompt-registry/application/tenant-isolation.test.ts`, mirroring its existing `describe("prompt_versions", ...)` block: prove an org A caller cannot read or write an org B skill version's file row by ID (constitution M3 — every tenant-scoped resource type needs at least one negative cross-tenant test; depends on T001/T002's RLS policy and T005's repo functions)

**Checkpoint**: `pnpm typecheck` fails loudly at every real call site still using the old shapes (`publish-version.ts`, `fork-skill.ts`, `expand.ts`, both REST routes, `mcp-tools.ts`, the three UI components) — this is expected and is the worklist for Phases 3–6. T008 passes, proving RLS is correctly enforced on the new table before any application code depends on that guarantee.

---

## Phase 3: User Story 1 - Publish a skill version as instructions plus files (Priority: P1) 🎯 MVP

**Goal**: A skill owner can publish a new template-kind version with a required main file plus optional named supporting files; validation rejects empty/oversized/duplicate/over-count files.

**Independent Test**: Publish a version with a main file and two supporting files via `publishVersion`/`POST /api/skills/[name]/versions`; confirm all three are stored and returned correctly.

### Tests for User Story 1 ⚠️

- [x] T009 [P] [US1] Failing tests for file-bundle validation (empty main file, a file >64 KB, duplicate supporting-file name, >20 supporting files, each expecting `InvalidVersionFilesError`) in `src/bcs/prompt-registry/application/publish-version.test.ts`
- [x] T010 [P] [US1] Failing test: publishing a version with a main file and two supporting files succeeds and all three are retrievable exactly as authored, in `src/bcs/prompt-registry/application/publish-version.test.ts`
- [x] T011 [P] [US1] Failing test: publishing a version with only a main file (zero supporting files) succeeds, in `src/bcs/prompt-registry/application/publish-version.test.ts`
- [x] T012 [P] [US1] Failing test: chain-kind publish (via `steps`) is unaffected — still works, rejects if `mainFile` and `steps` are both given or neither, in `src/bcs/prompt-registry/application/publish-version.test.ts`

### Implementation for User Story 1

- [x] T013 [US1] Implement file-bundle validation (non-empty main file, ≤64 KB per file, unique supporting-file names, ≤20 supporting files) in `src/bcs/prompt-registry/application/publish-version.ts`, throwing `InvalidVersionFilesError` with a message naming the specific file/limit (depends on T003, T009–T012 failing)
- [x] T014 [US1] Insert `mainFile` (name `SKILL.md`, `isMain: true`) and `supportingFiles` rows via `prompt-version-files-repo.ts`'s `insertFiles`, inside `publishVersion`'s existing `withAudit` transaction, in `src/bcs/prompt-registry/application/publish-version.ts` (depends on T005, T013)
- [x] T015 [US1] Update `POST /api/skills/[name]/versions`'s zod schema and body mapping (`mainFile`/`supportingFiles` instead of `systemTemplate`/`userTemplate`/`inputSchema`) in `src/app/api/skills/[name]/versions/route.ts`
- [x] T016 [US1] Update `fork-skill.ts`'s own hand-built `insertPromptVersion` call site: when the source version is new-shape, copy its files (main + supporting) into the fork; when legacy-shape, copy its `systemTemplate`/`userTemplate` unchanged (no behavior change to forking itself, just following the shape through), in `src/bcs/prompt-registry/application/fork-skill.ts`
- [x] T017 [US1] Run T009–T012, confirm green

**Checkpoint**: User Story 1 fully functional and testable independently — a version can be published with files and read back correctly.

---

## Phase 4: User Story 2 - Invoke a skill with no supplied input (Priority: P1)

**Goal**: `expand()` (and its REST/MCP consumers) drop the `input` parameter entirely and return a single resolved `content` string with applied policies/objectives.

**Independent Test**: Call `expand()` for a published new-shape template-kind skill with no `input` argument; verify it returns `{ content, appliedPolicies, objectives }`.

**Depends on**: Phase 3 (needs a way to publish new-shape versions to expand against).

### Tests for User Story 2 ⚠️

- [x] T018 [P] [US2] Failing test: `expand()` on a new-shape version returns `{content, appliedPolicies, objectives}` with no `input` argument accepted, in `src/bcs/prompt-registry/application/expand.test.ts`
- [x] T019 [P] [US2] Failing test: `include_prompt('name')` composes correctly for every shape pairing (new includes new, new includes legacy, legacy includes new), bounded by `MAX_INCLUDE_DEPTH`, in `src/bcs/prompt-registry/application/expand-inclusion.test.ts`
- [x] T020 [P] [US2] Failing test: policy prepend/append/inject apply correctly to a new-shape version's single content, in `src/bcs/prompt-registry/application/expand-governance.test.ts`
- [x] T021 [P] [US2] Failing test: expansion with no acting user still resolves successfully with empty `appliedPolicies`/`objectives`, in `src/bcs/prompt-registry/application/expand.test.ts`

### Implementation for User Story 2

- [x] T022 [US2] Change `IncludableVersion` to a tagged union (`{kind:"content", content} | {kind:"legacy", systemTemplate, userTemplate}`); branch `buildIncludePrompt` on `.kind`; add `renderContentWithIncludes(content, variables, promptCache): string` alongside the existing `renderWithIncludes`, in `src/bcs/prompt-registry/infrastructure/template-renderer.ts`
- [x] T023 [US2] Update `prefetchIncludedVersions` to build the correct `IncludableVersion` variant per referenced skill name (new-shape → `{kind:"content"}` from its main file; legacy-shape → `{kind:"legacy"}`), in `src/bcs/prompt-registry/application/expand.ts` (depends on T022)
- [x] T024 [US2] Rewrite `expand()`'s core resolution to branch on the top-level version's shape: new-shape applies prepend/append/inject directly to the main-file content and renders via `renderContentWithIncludes`; legacy-shape keeps the existing `applyPolicies`/`renderWithIncludes` path unchanged and composes `content = systemMessage ? \`${systemMessage}\n\n${userMessage}\` : userMessage`; remove the `input` parameter entirely, in `src/bcs/prompt-registry/application/expand.ts` (depends on T004, T023)
- [x] T025 [US2] Update `POST /api/skills/[name]/expand`: drop `input` from the zod request schema (confirm the now-unknown field is silently stripped, not rejected, per zod's default non-strict `.parse()`); response body becomes `{content, appliedPolicies, objectives}`, in `src/app/api/skills/[name]/expand/route.ts`
- [x] T026 [US2] Update MCP `sh-run`: drop `input` from `toolInputSchemas["sh-run"]` and `shRun`'s parameters/`parseLegacyInput` call; output formatting becomes the resolved `content` followed by `[Policies Applied]` (no more `[System]`/`[User]` split), in `src/bcs/distribution/application/mcp-tools.ts`
- [x] T027 [US2] Update `expand-characterization.test.ts` (and any other test still asserting the old `systemMessage`/`userMessage` response shape) to assert the new `content` shape, in `src/bcs/prompt-registry/application/expand-characterization.test.ts`
- [x] T028 [US2] Run T018–T021 plus the full `expand*.test.ts` suite, confirm green

**Checkpoint**: User Stories 1 and 2 both work independently — publishing and expanding new-shape skills is fully functional end to end (application layer, REST, MCP).

---

## Phase 5: User Story 4 - Existing published skills keep working unchanged (Priority: P1)

**Goal**: Every skill version published before this feature shipped keeps resolving via `expand()` using its original legacy content, with zero automatic conversion.

**Independent Test**: Expand a pre-existing (legacy-shape) published version after the feature ships; verify it resolves without error, using its originally-published content composed into the new `content` field.

**Depends on**: Phase 4 (the legacy-shape branch is implemented as part of T024; this phase is dedicated verification, not new implementation).

### Tests for User Story 4 ⚠️

- [x] T029 [P] [US4] Failing-then-passing test: `expand()` on a legacy-shape version (seeded with `systemTemplate`/`userTemplate` set directly, zero `prompt_version_files` rows) resolves successfully, `content` equals the composed `systemMessage`/`userMessage`, in `src/bcs/prompt-registry/application/expand.test.ts`
- [x] T030 [P] [US4] Failing-then-passing test: publishing a brand-new version never writes to another version's `system_template`/`user_template`/rows, and never inserts `prompt_version_files` rows for a legacy-shape version, in `src/bcs/prompt-registry/application/publish-version.test.ts`

### Implementation for User Story 4

- [x] T031 [US4] Run T029–T030 against the Phase 4 implementation (T022–T024); no new production code expected — if either test fails, fix the shape-branch in `src/bcs/prompt-registry/application/expand.ts` until both pass

**Checkpoint**: Backend backward-compatibility formally proven by test, not just assumed from code reading.

---

## Phase 6: User Story 3 - Browse and author a skill's files in the app (Priority: P2)

**Goal**: The skill detail page's Overview/Files tabs and the New skill/New version drawers author and display the new file-bundle shape; a legacy-shape version falls back to an inline read-only display with no Files tab (FR-019, closing out US4's UI-facing acceptance scenario in the same component).

**Independent Test**: Open a published new-shape skill in the app; confirm the Files tab lists the main file plus supporting files, selecting a file shows its content, and the Preview/Plain-text toggle works. Separately, open a legacy-shape skill; confirm no Files tab and an inline legacy-content notice on Overview.

**Depends on**: Phase 3 (data to display) and Phase 4 (Overview needs `appliedPolicies`/`objectives` semantics unchanged, no direct code dependency but same domain types).

### Tests for User Story 3 (and US4's UI fallback) ⚠️

- [x] T032 [P] [US3] Update `src/app/(app)/prompts/new-prompt-drawer.test.tsx`: assert the drawer has no template fields, submits only name/description/tags
- [x] T033 [P] [US3] Update `src/app/(app)/prompts/[name]/new-version-drawer.test.tsx`: assert the Template-kind branch renders a main-file editor plus add/select/remove supporting-file controls instead of System/User template textareas; Chain-kind branch unchanged
- [x] T034 [P] [US3] Update `src/app/(app)/prompts/[name]/prompt-detail-view.test.tsx`: assert Overview summary cards (file count, active version, applied-policy count, owner) and a Files tab (main file marked required with no remove control, supporting files listed, Preview/Plain-text toggle on the main file) for a new-shape version
- [x] T035 [US4] Same file, new case: assert a legacy-shape version (no `files`) renders no Files tab and shows its `systemTemplate`/`userTemplate` inline on Overview with a "predates file-based skills" note, in `src/app/(app)/prompts/[name]/prompt-detail-view.test.tsx` (sequenced after T034, same file)

### Implementation for User Story 3

- [x] T036 [P] [US3] Remove system/user template fields from `src/app/(app)/prompts/new-prompt-drawer.tsx`; submit name/description/tags only
- [x] T037 [US3] Rewrite `new-version-drawer.tsx`'s Template-kind branch: main-file textarea (required; prefilled from the active version's main file when re-publishing a new-shape skill, empty when re-publishing a legacy-shape one) plus a supporting-files list with add/select/edit/remove, replacing the System/User template textareas, in `src/app/(app)/prompts/[name]/new-version-drawer.tsx`
- [x] T038 [US3] Wire `new-prompt-drawer.tsx`'s successful submit (and `createPromptAction` in `src/app/(app)/prompts/actions.ts`) to immediately open the New Version drawer for authoring v1, in `src/app/(app)/prompts/new-prompt-drawer.tsx` and `src/app/(app)/prompts/actions.ts` (depends on T036, T037)
- [x] T039 [US3] Update `NewVersionValues`/`publishVersionAction` in `src/app/(app)/prompts/actions.ts` to send `mainFile`/`supportingFiles` instead of `systemTemplate`/`userTemplate` (depends on T015, T037)
- [x] T040 [US3] Add Overview summary cards (file count, active version, applied-policy count, owner) to `src/app/(app)/prompts/[name]/prompt-detail-view.tsx`, shown for new-shape versions in place of the current `TemplateBlock` system/user display
- [x] T041 [US3] Add a Files tab to `prompt-detail-view.tsx`: file list (main file marked required, no remove control on it), selected-file content view with Preview (rendered Markdown blocks: H1/H2/H3/list-item/paragraph/blank, per the mockup's block renderer)/Plain-text toggle for the main file, per-file Edit/Save, Add-file, Remove-supporting-file, in `src/app/(app)/prompts/[name]/prompt-detail-view.tsx` (depends on T040)
- [x] T042 [US4] Add the legacy-shape fallback to `prompt-detail-view.tsx`: when the active version has no `files`, render no Files tab and show its `systemTemplate`/`userTemplate` inline read-only on Overview with a "predates file-based skills" note (FR-019), in the same file (depends on T041)
- [x] T043 [US3] Update the server-component data loader (`src/app/(app)/prompts/[name]/prompt-detail.tsx`, `page.tsx`) to pass each version's `files` array (from T006) into `PromptDetailData`
- [x] T044 [US3] Run T032–T035, confirm green; run `pnpm build` to catch any client/server bundle-split issue (this repo's own documented gotcha — `pnpm typecheck`/`pnpm vitest` don't catch it); manually re-confirm SC-004 (locate/read any file within two navigation actions from the skill's detail page)

**Checkpoint**: All four user stories independently functional; the app fully reflects the new file-bundle model for new-shape skills and degrades cleanly for legacy-shape ones.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Repo-wide consistency and final validation gates.

- [x] T045 [P] Update `src/bcs/prompt-registry/CONTRACT.md`'s exported-API table for `expand`'s and `publishVersion`'s new signatures
- [x] T046 Run `pnpm lint` (covers `eslint-plugin-boundaries` module-boundary checks) and fix any fallout
- [x] T047 Run `pnpm typecheck` repo-wide to catch every remaining call site of the changed signatures (this repo's established practice for shared-function signature changes — a real compiler-driven call-site audit, not just a formality)
- [x] T048 Run the full suite sequentially: `pnpm exec vitest run --fileParallelism=false --testTimeout=30000` (never bare `pnpm test` — see project conventions on Docker daemon exhaustion)
- [x] T049 Manually execute `quickstart.md` Scenarios 1–5 against the running dev app to confirm end-to-end behavior

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 (schema must exist before domain/repo code compiles against it) — BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Phase 2 only.
- **US2 (Phase 4)**: Depends on Phase 2 and Phase 3 (needs new-shape versions to expand against).
- **US4 (Phase 5)**: Depends on Phase 4 (the legacy-shape branch is implemented there; this phase only adds verification).
- **US3 (Phase 6)**: Depends on Phase 3 and Phase 4 (UI reads/writes the same domain types and calls the same publish/expand paths).
- **Polish (Phase 7)**: Depends on all of the above.

### Parallel Opportunities

- T004, T005, T007, T008 (Phase 2) can run in parallel — different files (T008 depends on T001/T002/T005 being complete first, so it trails slightly within the phase).
- T009–T012 (US1 tests) can run in parallel — same file, but independent test cases with no shared mutable state.
- T018–T021 (US2 tests) can run in parallel — different files (T018/T021 share a file but are independent cases).
- T029–T030 (US4 tests) can run in parallel.
- T032–T034 (US3 tests) can run in parallel — different files (T035 touches the same file as T034, sequenced after it).
- T036 can run in parallel with Phase 4/5 work (different files), though it's listed under US3 for traceability.

---

## Parallel Example: User Story 1

```bash
# Launch all US1 test-writing together:
Task: "Failing tests for file-bundle validation in src/bcs/prompt-registry/application/publish-version.test.ts"
Task: "Failing test: main file + two supporting files roundtrip in src/bcs/prompt-registry/application/publish-version.test.ts"
Task: "Failing test: main-file-only publish succeeds in src/bcs/prompt-registry/application/publish-version.test.ts"
Task: "Failing test: chain-kind publish unaffected in src/bcs/prompt-registry/application/publish-version.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1).
2. **STOP and VALIDATE**: publish a version with files via `publishVersion` directly (or a quick REST call) and confirm files round-trip correctly.
3. This alone doesn't make skills expandable in the new shape yet (that's US2) — but it proves the data model, validation, and tenant isolation are correct in isolation.

### Incremental Delivery

1. Setup + Foundational → schema, shared types, and the RLS tenant-isolation proof exist.
2. US1 → skills can be authored in the new shape (backend only).
3. US2 → those skills can be expanded/run (REST + MCP work end to end) — this is the first point the feature is genuinely usable by a real caller.
4. US4 → formally proves nothing broke for every already-published skill (should already be true from US2's implementation; this phase is the safety net).
5. US3 → the app UI catches up to what the backend already supports.
6. Polish → repo-wide consistency + full-suite/manual validation gates before `/as-finish`.

---

## Notes

- [P] tasks touch different files, or the same file with non-overlapping, independent content (e.g. distinct test cases).
- Every implementation task in Phases 3–6 has a preceding failing-test task per this repo's constitution (P1) — do not skip straight to implementation.
- `publish-version.ts`, `expand.ts`, and `prompt-detail-view.tsx` are each touched by more than one phase — tasks against the same file are ordered non-parallel within this document even when not explicitly marked, to avoid merge conflicts within a single implementation session.
- Remediated during `/speckit-analyze` (2026-08-06): added T008 (constitution M3 tenant-isolation test for `prompt_version_files`, previously missing) and reordered the New Skill/New Version drawer tasks (T036–T038) so the drawer rewrite a wiring task depends on is no longer sequenced after it.
- **Scope discovered during implementation** (2026-08-06, not anticipated by plan.md/research.md — grepping "every call site of a changing shared function" per this repo's own documented precedent still missed these on the first pass):
  - Chain-step resolution (`start-skill-chain-run.ts`, `advance-skill-chain-run.ts`, `resolve-chain-step.ts`, `get-skill-chain-run.ts`, `skill-chain-run-steps-repo.ts`, `domain/skill-chain.ts`, `schema.ts`'s `skill_chain_run_steps` table) also destructured `expand()`'s old `systemMessage`/`userMessage` shape and threaded a caller-supplied `input` object built from prior steps' reported outputs (`ChainStepDependencyValue`/`buildStepInput`) into each step's `expand()` call. Both had to be updated: the response-shape propagation is mechanical (matches FR-012's reasoning); the `input`-threading removal was a real design fork, resolved with the user mid-implementation — dependency auto-substitution is dropped entirely (a step resolves with zero arguments, exactly like a top-level `expand()` call; a prior step's reported output stays visible to the *caller* via the run's step list, never auto-injected into a later step's content). Added migration `0028_prompt_registry_skill_chain_step_content.sql` (`skill_chain_run_steps.system_message`/`user_message` → single `content` column).
  - The standalone `cli/` package's `run` command (`cli/src/http/skillcanon-client.ts`'s `expandSkill`, `cli/src/commands/run.ts`) calls the same REST `/expand` endpoint and also expected the old `{systemMessage, userMessage}` shape plus a `--input` flag — not covered by root `pnpm typecheck`/`pnpm vitest` since `cli/` has its own separate toolchain (per CLAUDE.md). Updated to the new `{content}` shape and removed the now-meaningless `--input` flag; this is the same mechanical propagation already done for REST/MCP, not the separate CLI-side stub/sync rework tracked at `008-distribution/007-skill-file-format-cli-support.md`.
  - Raw-JSON-body route tests (e.g. `src/app/api/skills/[name]/versions/route.test.ts`) construct request bodies as `JSON.stringify({...})` literals, which `pnpm typecheck` cannot check against `PublishVersionParams` — several still used `systemTemplate`/`userTemplate` and only surfaced as real (non-type-error) test failures during the actual `pnpm vitest` run. Fixed; worth remembering next time a request-body-shaped domain type changes.
  - Full-suite verification (`pnpm exec vitest run --fileParallelism=false --testTimeout=30000`, 255 files) found exactly one failure: `src/bcs/identity-access/infrastructure/schema.test.ts` with a Docker/Testcontainers provisioning error (`docker-modem` HTTP 500), unrelated to this feature — confirmed transient by re-running that file alone immediately afterward (10/10 passed).
