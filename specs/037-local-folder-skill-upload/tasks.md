# Tasks: Local Folder Skill Upload

**Input**: Design documents from `/specs/037-local-folder-skill-upload/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/server-actions.md, quickstart.md

**Tests**: Included — Constitution Principle I (Test-First Development) requires a failing test before new domain logic in this codebase.

**Organization**: Tasks are grouped by user story (spec.md) to enable independent implementation and testing of each story.

> Revised after `/speckit-analyze` (2026-08-10): added the pure path-filtering test (F3), the `runLocalSkillImportBatch` extraction + Testcontainers test for User Story 3 (F2), a no-cap regression test (F4), an axe-core check (F1), a Project Structure fix already applied to `plan.md` (F5), an explicit confirm-button behavior note (F6), and a graceful-degradation note for unsupported browsers tied to the new FR-015 (F7). Task IDs below reflect the revised numbering.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3)

## Path Conventions

Single Next.js application at repository root (this repo's unified scaffold — no `backend/`/`frontend` split, no `legacy/` involvement). Paths below are repo-relative.

---

## Phase 1: Setup

**Purpose**: Scaffold the new files this feature touches; no new dependency or project-level config is needed (per `research.md` — no new npm package, no new REST route, no new DB table).

- [X] T001 Create empty scaffolds `src/bcs/prompt-registry/domain/local-skill-source.ts` and `src/bcs/prompt-registry/domain/local-skill-source.test.ts`, each with a header comment referencing `013-skill-import-and-external-registries/002` (spec `037-local-folder-skill-upload`), mirroring the existing header style in `domain/external-skill-source.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared domain scanning logic, its Server Action wrappers, and the client-side folder-reading glue — every user story below depends on all of these existing first.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Define `LocalSkillFileEntry`, `LocalSkillCandidate`, and `LocalSkillScanResult` types in `src/bcs/prompt-registry/domain/local-skill-source.ts`, matching the shapes in `data-model.md`.
- [X] T003 Write failing tests in `src/bcs/prompt-registry/domain/local-skill-source.test.ts` for `scanLocalSkillFolders()`'s core candidate-detection rule: a single root-level `SKILL.md`, a `SKILL.md` nested under `.claude/skills/<name>/`, and one nested under `.agents/skills/<name>/` each resolve to exactly one candidate with correct `name`/`description`/`mainFile`/`supportingFiles`/`folderPath` (per `research.md`'s "any `SKILL.md`, its parent directory is a candidate" rule).
- [X] T004 Implement `scanLocalSkillFolders()` in `src/bcs/prompt-registry/domain/local-skill-source.ts` to make T003 pass — reuse `parseSkillFrontmatter()` from `./external-skill-source` for name/description resolution; supporting files are every other direct (non-recursive) file sibling of the matched `SKILL.md`.
- [X] T005 Barrel-export `scanLocalSkillFolders`, `LocalSkillCandidate`, `LocalSkillFileEntry`, `LocalSkillScanResult` from `src/bcs/prompt-registry/index.ts`, following the existing export style used for `fetchExternalSkillSource`/`ExternalSkillCandidate`.
- [X] T006 [P] Add auth-gated Server Action skeletons to `src/app/(app)/prompts/actions.ts`: `scanLocalSkillFoldersAction(entries)`, and `importLocalSkillsAction(skills)` structured from the start as a thin wrapper — resolve `actingUser` via the existing `requireActingUser()`, then delegate to a separately-exported `runLocalSkillImportBatch(actingUser, skills)` (empty body for now) — per `contracts/server-actions.md`. Exporting `runLocalSkillImportBatch` separately is what makes T026 (US3's Testcontainers test) possible without fighting `next/headers()`'s request-context requirement.
- [X] T007 [P] Write failing Vitest tests in a new `src/app/(app)/prompts/local-folder-reader.test.ts` for the pure, DOM-independent half of the client reader: given a flat list of relative paths (including some outside any `SKILL.md` directory), assert the helper returns exactly the set of candidate directory paths. No `File`/`FileList`/DOM needed for this half (FR-012/SC-005 — closes a gap `/speckit-analyze` found: this guarantee had an implementing task but no verifying one).
- [X] T008 [P] Create `src/app/(app)/prompts/local-folder-reader.ts` with: (a) the pure candidate-path-filtering helper, implemented to pass T007; (b) a browser-only `readLocalSkillFolderEntries(source: FileList | DataTransferItemList)` that enumerates the selection via `webkitRelativePath`/`webkitGetAsEntry()`, calls helper (a) first, and only then reads `.text()` for files under a candidate directory — implementing FR-012 (never reads/transmits anything outside a matched candidate folder).

**Checkpoint**: domain scanning, both Server Actions (with `runLocalSkillImportBatch` stubbed), and the client-side folder-reading glue (with its pure half tested) all exist and typecheck. User story implementation can now begin.

---

## Phase 3: User Story 1 - Bulk-register skills already sitting in a local folder (Priority: P1) 🎯 MVP

**Goal**: A user can select a local folder, see the valid skills detected inside it, confirm, and have them created in their organization's registry in one action.

**Independent Test**: Select a folder containing three valid skill folders, confirm the batch, and verify three new, correctly-owned skills appear with matching content. Selecting a folder with none shows a clear "nothing found" message and creates nothing.

### Tests for User Story 1

- [X] T009 [US1] Extend `src/bcs/prompt-registry/domain/local-skill-source.test.ts`: `scanLocalSkillFolders()` returns an empty `candidates` array (not a thrown error) for entries containing no `SKILL.md` anywhere.

### Implementation for User Story 1

- [X] T010 [US1] Verify T004's implementation satisfies T009 (adjust `scanLocalSkillFolders()` in `src/bcs/prompt-registry/domain/local-skill-source.ts` if the empty case isn't already handled cleanly).
- [X] T011 [US1] Implement `runLocalSkillImportBatch`'s body in `src/app/(app)/prompts/actions.ts`: for each selected skill, one independent `withTenantContext(db, actingUser.orgId, tx => ...)` transaction calling `createPrompt` (no `sourceUrl`) then `publishVersion` with `version: "v1"`, collecting `imported`/`failed`, and `revalidatePath("/prompts")` once if anything succeeded — per `contracts/server-actions.md`. (Its per-skill try/catch isolation is exercised properly starting T026 in US3 — a basic all-succeed path is enough to satisfy US1 alone.)
- [X] T012 [US1] Implement `scanLocalSkillFoldersAction`'s body in `src/app/(app)/prompts/actions.ts`: call `scanLocalSkillFolders(entries)` and return its result — pure read, no `withTenantContext` needed (matches `fetchExternalSkillSourceAction`'s existing precedent).
- [X] T013 [US1] Add a third `"upload"` mode to the `NewSkillMode` union and mode-tab button ("Import from folder") in `src/app/(app)/prompts/new-prompt-drawer.tsx`, with a folder-picker input (`webkitdirectory`) and drop zone wired to `readLocalSkillFolderEntries` from `local-folder-reader.ts`, calling a new `onScanLocalFolder` prop. If `webkitdirectory`/`webkitGetAsEntry` support is absent, show a clear "folder selection isn't available in this browser" message instead of a non-functional picker (FR-015).
- [X] T014 [US1] Render the detected-candidates preview list in the new mode (reusing the existing checkbox-row visual pattern from the `"import"` mode), all candidates checked by default, wired to a new `onImportLocalSkills` prop; on full success, call `onImported()` and close the drawer. **Unlike the sibling `"import"` mode, the confirm button MUST stay enabled even when a selected candidate's name collides with an existing org skill** — do not port over that mode's `collidingNames.length > 0`-disables-confirm logic here, or User Story 3's partial-success scenario becomes unreachable through the UI (see `contracts/server-actions.md`'s "Important UI note").
- [X] T015 [US1] Add the "no skills found" empty-state message shown when a scan returns zero candidates.
- [X] T016 [US1] Wire `NewPromptDrawer`'s new `onScanLocalFolder`/`onImportLocalSkills` props through to `scanLocalSkillFoldersAction`/`importLocalSkillsAction` in `src/app/(app)/prompts/prompts-list.tsx`, matching how `onFetchImportSource`/`onImportSkills` are already wired there.
- [X] T017 [US1] Extend `src/app/(app)/prompts/new-prompt-drawer.test.tsx` with `renderToStaticMarkup` structural assertions: the drawer renders an "Import from folder" tab alongside the existing two modes.

**Checkpoint**: MVP demoable end-to-end — select a folder, confirm, skills get created, owned by the caller.

---

## Phase 4: User Story 2 - Review and choose which detected skills to register (Priority: P2)

**Goal**: Nothing is registered without explicit confirmation of exactly which detected skills to include; malformed folders and intra-batch name conflicts are clearly flagged rather than silently included or silently dropped; an unusually large batch is still handled in full.

**Independent Test**: A folder with 3 valid + 1 malformed + 2 same-named candidates — the preview shows all of them, the malformed one is excluded from selection, the duplicate-named pair is flagged and mutually exclusive, and deselecting one of the 3 valid ones results in only 2 being created.

### Tests for User Story 2

- [X] T018 [US2] Extend `local-skill-source.test.ts`: a candidate directory whose main file is empty, exceeds `MAX_FILE_SIZE_BYTES`, or resolves to no usable name is excluded from `candidates` and appears in `invalidFolders` with a reason (FR-010).
- [X] T019 [US2] Extend `local-skill-source.test.ts`: two candidates that resolve to the same `name` both remain in `candidates`, and that name appears in `duplicateNames` (FR-013).
- [X] T020 [US2] Extend `local-skill-source.test.ts`: a synthetic batch of 30+ valid, uniquely-named skill folders all appear in `candidates` with none dropped or truncated — regression guard for FR-014's "no fixed cap" (a gap `/speckit-analyze` found: nothing previously guarded against a future accidental cap, e.g. copying the sibling `001` feature's `MAX_EXTERNAL_SKILLS_PER_SOURCE` pattern).

### Implementation for User Story 2

- [X] T021 [US2] Implement invalid-folder exclusion and intra-batch duplicate-name detection in `scanLocalSkillFolders()` (`src/bcs/prompt-registry/domain/local-skill-source.ts`) to pass T018-T020 — reuse `MAX_FILE_SIZE_BYTES`/`MAX_SUPPORTING_FILES` from `./prompt`; do not introduce any batch-size limit.
- [X] T022 [US2] Add per-candidate checkbox select/deselect to the new drawer mode in `new-prompt-drawer.tsx`, matching the existing `"import"` mode's `toggleChecked` pattern.
- [X] T023 [US2] Render `invalidFolders` entries in the preview as excluded/flagged (not selectable), reusing the existing malformed-item visual treatment style.
- [X] T024 [US2] Render `duplicateNames` conflicts: visually flag every candidate sharing a conflicting name and enforce "at most one selected per conflicting name" in the selection state logic.
- [ ] T025 [US2] ~~Extend `new-prompt-drawer.test.tsx`: structural assertions for a malformed-folder-excluded row and a duplicate-name-flagged pair rendering.~~ **Not completable as scoped, discovered during implementation**: the drawer's mode panels are conditionally mounted (`mode === "x" ? ... : ...`), so the upload panel's dynamic post-scan content never appears in a `renderToStaticMarkup` render from the default "blank" mode — the same pre-existing limitation already true of the sibling "import" mode's own body (never asserted for the same reason). Verified instead via live manual browser testing (both scenarios confirmed working correctly, including a real bug found and fixed: a stale duplicate-name banner not clearing after a partial-failure result). A rationale comment was added to `new-prompt-drawer.test.tsx` in place of a forced/fake test.

**Checkpoint**: preview/selection is fully safe — nothing malformed or ambiguous can be silently registered; User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Fail clearly on a name collision without losing the rest of the batch (Priority: P3)

**Goal**: A skill whose name already exists in the organization fails registration with a clear error while every other skill in the same batch still succeeds.

**Independent Test**: A batch of 3 candidates where 1 name already exists in the org — confirm the batch and verify 2 are created while the third clearly fails, with no silent overwrite and no mangled duplicate name.

### Tests for User Story 3

- [X] T026 [US3] Write a failing Testcontainers-backed test in a new `src/app/(app)/prompts/actions.local-import.test.ts` (following this repo's `startTestDb()`/`testDb` convention) for `runLocalSkillImportBatch`: seed one existing skill via `createPrompt`, then call `runLocalSkillImportBatch` with a batch of 3 candidates where one name matches the seeded skill — assert exactly 2 names in `imported` and 1 entry in `failed` naming the conflict, all from one call. This is the concrete proof behind FR-006/FR-007/SC-003 and US3's independent test — a gap `/speckit-analyze` found had only a "verify by inspection" task before (mirroring the sibling `001` feature's own untested equivalent loop, likely because `requireActingUser()`'s `next/headers()` call isn't callable outside a real request — `runLocalSkillImportBatch` takes the actor as a plain parameter specifically to route around that).

### Implementation for User Story 3

- [X] T027 [US3] Implement/adjust `runLocalSkillImportBatch`'s per-skill try/catch in `src/app/(app)/prompts/actions.ts` to pass T026 — a `DuplicatePromptNameError` or `InvalidVersionFilesError` thrown by either `createPrompt` or `publishVersion` for one skill must not affect the other skills' independent transactions.
- [X] T028 [US3] Render `failed` entries returned by `importLocalSkillsAction` in the drawer's new mode (reusing the existing red-bordered failure-list treatment from the `"import"` mode), keeping only still-unresolved candidates selectable afterward and not auto-closing the drawer while failures remain — matching the existing `runImport()` behavior in the sibling mode.
- [ ] T029 [US3] ~~Extend `new-prompt-drawer.test.tsx`: structural assertion that a partial-failure result renders the failure message and the drawer does not auto-close when failures remain.~~ **Not completable as scoped** — same conditional-mount limitation as T025. Verified live: a batch with a genuine existing-org-name collision correctly shows the failure message, keeps the drawer open, and correctly clears any now-stale duplicate-name banner for a sibling candidate that succeeded (the live test that caught and confirmed the fix for the bug noted in T025).

**Checkpoint**: all three user stories independently functional — full feature complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T030 [P] Add an `axe-core` assertion to `new-prompt-drawer.test.tsx` (`expectNoCriticalOrSeriousAxeViolations` from `@/shared/testing/accessibility`, the same helper `shared/ui/drawer.test.tsx` already uses) covering the drawer's actual rendered content across all three modes (Constitution Principle VIII). This also closes a pre-existing gap in the already-shipped `"import"` mode, which — like the new mode this feature adds — had never been axe-tested itself; only the generic `Drawer` primitive shell has been.
- [X] T031 [P] Run `pnpm typecheck` and `pnpm lint`; fix any issues across all files touched by this feature.
- [X] T032 [P] Run `pnpm vitest run src/bcs/prompt-registry/domain/local-skill-source.test.ts "src/app/(app)/prompts/local-folder-reader.test.ts" "src/app/(app)/prompts/actions.local-import.test.ts" "src/app/(app)/prompts/new-prompt-drawer.test.tsx"`; fix any failures.
- [X] T033 Execute `quickstart.md`'s manual browser validation steps end-to-end against the local dev stack. Verified live (signed in as `alice@example.com`): 3-tab drawer renders correctly; a real multi-file folder selection (via simulated `webkitRelativePath`/`DataTransfer`, since a real OS folder-picker dialog can't be driven by browser automation) correctly detects a skill folder, excludes unrelated `README.md`/`node_modules/` noise (FR-012), previews it checked by default, and creates it on confirm with matching content on its detail page; a batch mixing an intra-batch duplicate pair + a malformed empty `SKILL.md` + an existing-org-name collision + a unique skill correctly flags/excludes each and creates the unaffected ones on confirm while the collision fails clearly (US3) without auto-closing the drawer; a genuinely empty folder shows "No skills found" (FR-011); signed-out access redirects to `/login` before anything is scanned (FR-009). Also caught and fixed a real bug during this pass (stale duplicate-name banner not clearing after a partial-failure result) — see `new-prompt-drawer.tsx`'s `runLocalImport`.
- [X] T034 Update `backlog/013-skill-import-and-external-registries/002-existing-repo-skill-upload.md`: check off completed Requirements/Acceptance Criteria and move it to `backlog/013-skill-import-and-external-registries/archive/`, per this repo's established archive convention. Done — and since this was the epic's last open feature, the whole epic directory was moved to `backlog/done/013-skill-import-and-external-registries/` per the established whole-epic-completion convention (`EPIC.md` status/checklist updated first).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories — `scanLocalSkillFolders()`'s base shape, both Server Actions (with `runLocalSkillImportBatch` stubbed), and the client-side reader (with its pure half tested) must exist before any story's UI/behavior work.
- **User Stories (Phase 3-5)**: All depend on Foundational completion. US1 is the MVP; US2 and US3 both extend the same files US1 introduces (the drawer's new mode, `scanLocalSkillFolders()`, `runLocalSkillImportBatch`), so — unlike a typical feature where stories touch disjoint files — US2 and US3 should be implemented sequentially after US1 lands, not in parallel with it, even though each remains independently testable once its own phase is done.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- Tests before implementation: T003→T004, T007→T008, T009→T010, T018-T020→T021, T026→T027.
- Domain layer before Server Actions before UI (matches Foundational's own internal order).
- Story complete and checkpoint-verified before moving to the next priority.

### Parallel Opportunities

- T002, T006, and T007 can run in parallel within Foundational (different files: domain types vs. actions vs. client reader's test), but T003/T004 (which need T002's types) should follow T002, and T008 should follow T007.
- T030/T031/T032 in Polish can run in parallel with each other.
- Because US2/US3 extend the exact same files US1 creates/modifies (`local-skill-source.ts`, `actions.ts`, `new-prompt-drawer.tsx`), there is little real cross-story parallelism available here beyond Foundational — this is a small, tightly-coupled feature, not a multi-team surface.

---

## Parallel Example: Foundational Phase

```bash
# Can start together once T001 (scaffolds) is done:
Task: "Define LocalSkillFileEntry/LocalSkillCandidate/LocalSkillScanResult types in src/bcs/prompt-registry/domain/local-skill-source.ts"
Task: "Add auth-gated Server Action skeletons (with runLocalSkillImportBatch stubbed) to src/app/(app)/prompts/actions.ts"
Task: "Write failing tests for the pure path-filtering helper in src/app/(app)/prompts/local-folder-reader.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (domain scan function, both Server Actions, client reader).
3. Complete Phase 3: User Story 1 — folder select → preview all → confirm → created.
4. **STOP and VALIDATE**: run T017's tests and manually confirm the MVP flow in the browser.
5. Continue to US2/US3 for the full feature, or ship the MVP if the all-or-nothing confirm behavior is acceptable short-term.

### Incremental Delivery

1. Setup + Foundational → shared scanning/action/reader infrastructure ready.
2. Add User Story 1 → demoable bulk-create (MVP).
3. Add User Story 2 → safe selection (malformed/duplicate/scale handling) — no regression to US1's happy path.
4. Add User Story 3 → graceful partial-failure handling on collisions, now with real automated coverage — no regression to US1/US2.
5. Polish → accessibility check, typecheck/lint/tests/manual validation/backlog archival.

---

## Notes

- [P] tasks touch different files with no unmet dependency.
- This feature is small and single-surface (one drawer, one domain module, one actions file) — most of its value comes from sequencing within a phase, not cross-story parallel work.
- Commit after each task or logical group; stop at each phase checkpoint to validate independently.
- No REST route, no MCP tool, no CLI (`cli/`) change, no new DB migration for this feature — see `plan.md`'s Technical Context.
