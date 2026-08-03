# Tasks: Fix Legacy Backend Import Path Mismatch

**Input**: Design documents from `/specs/012-fix-legacy-backend-import-path-mismatch/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Required by the feature specification. Use the direct import smoke check and the full legacy backend pytest suite.

**Organization**: Tasks are grouped by user story so the canonical import fix can be validated independently before broader tooling/test discovery validation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: User story label from spec.md
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the current mismatch and identify active stale references before editing.

- [x] T001 Run pre-change import smoke check from `legacy/backend` with `uv run python -c "from src.skillcanon_server.services import prompt_service"` and confirm it fails because `legacy/backend/src/skillcanon_server` is absent
- [x] T002 Search active legacy backend paths for `spechub_server` and `skillcanon_server` references in `legacy/backend/src`, `legacy/backend/tests`, `legacy/backend/pyproject.toml`, `legacy/backend/uv.lock`, `legacy/backend/alembic`, `legacy/backend/scripts`, and `legacy/backend/scratch`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Perform the source package rename required before any canonical import can work.

**CRITICAL**: No user story validation can pass until this phase is complete.

- [x] T003 Rename package directory with `git mv legacy/backend/src/spechub_server legacy/backend/src/skillcanon_server`
- [x] T004 Verify `legacy/backend/pyproject.toml`, `legacy/backend/uv.lock`, `legacy/backend/alembic/env.py`, and `legacy/backend/scripts/start.sh` reference `skillcanon_server` only where they reference the backend package root

**Checkpoint**: The legacy backend has one physical source package root at `legacy/backend/src/skillcanon_server`.

---

## Phase 3: User Story 1 - Import the legacy backend through the canonical package name (Priority: P1)

**Goal**: Canonical imports resolve without a shim or compatibility package.

**Independent Test**: From `legacy/backend`, run `uv run python -c "from src.skillcanon_server.services import prompt_service"` with no alias bootstrap.

### Tests for User Story 1

- [x] T005 [US1] Run the canonical import smoke check from `legacy/backend` with `uv run python -c "from src.skillcanon_server.services import prompt_service"`

### Implementation for User Story 1

- [x] T006 [US1] Confirm internal imports under `legacy/backend/src/skillcanon_server` consistently use `src.skillcanon_server`

**Checkpoint**: User Story 1 is complete when the direct import smoke check exits 0 without a shim.

---

## Phase 4: User Story 2 - Keep configuration and test discovery aligned with the canonical package path (Priority: P2)

**Goal**: Backend tooling and tests discover the renamed package through the canonical path.

**Independent Test**: From `legacy/backend`, run `uv run pytest tests/ -v` and confirm no import/package discovery failures remain.

### Tests for User Story 2

- [x] T007 [US2] Run the full legacy backend test suite from `legacy/backend` with `uv run pytest tests/ -v`

### Implementation for User Story 2

- [x] T008 [US2] Remove the `sys.modules` alias shim and old package-path explanation from `legacy/backend/scratch/expand_characterization_harness.py`
- [x] T009 [US2] Update `legacy/backend/scratch/expand_characterization_harness.py` to import `src.skillcanon_server` modules directly after adding `legacy/backend` to `sys.path`
- [x] T010 [US2] Search active source, test, and config paths for `spechub_server` and remove or rewrite any executable references in `legacy/backend/src`, `legacy/backend/tests`, `legacy/backend/pyproject.toml`, `legacy/backend/uv.lock`, `legacy/backend/alembic`, `legacy/backend/scripts`, and `legacy/backend/scratch`

**Checkpoint**: User Story 2 is complete when the full legacy backend pytest suite passes and active executable references no longer use `spechub_server`.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation consistency.

- [x] T011 Run `rg -n "spechub_server" legacy/backend/src legacy/backend/tests legacy/backend/pyproject.toml legacy/backend/uv.lock legacy/backend/alembic legacy/backend/scripts legacy/backend/scratch` and confirm there are no active executable references
- [x] T012 Run `git status --short` and review the rename plus generated Spec Kit artifacts for unintended files
- [x] T013 Run the quickstart validation commands documented in `specs/012-fix-legacy-backend-import-path-mismatch/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user-story validation.
- **User Story 1 (Phase 3)**: Depends on the directory rename in Phase 2.
- **User Story 2 (Phase 4)**: Depends on the directory rename in Phase 2 and can be validated after User Story 1 smoke import passes.
- **Polish (Phase 5)**: Depends on both user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: MVP; validates direct canonical imports.
- **User Story 2 (P2)**: Builds on the package rename and validates broader tooling/test discovery.

### Parallel Opportunities

- T004 can be reviewed independently after T003.
- T006 and T008/T009 touch different files after the rename and can be performed independently if needed.
- Final search and status review are sequential validation steps because they depend on all edits being complete.

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 to document the starting mismatch.
2. Complete Phase 2 by renaming the physical package directory.
3. Complete Phase 3 and validate the direct canonical import smoke check.

### Full Delivery

1. Complete the MVP path.
2. Remove the characterization harness alias shim and update stale old-name references.
3. Run the full legacy backend pytest suite.
4. Run repository search validation for stale executable references.
5. Mark completed tasks in this file as `[x]`.
