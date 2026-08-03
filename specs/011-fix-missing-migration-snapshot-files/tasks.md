# Tasks: Fix Missing Migration Snapshot Files

**Input**: Design documents from `/specs/011-fix-missing-migration-snapshot-files/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/no-api.md, quickstart.md

## Phase 1: Setup

- [X] T001 Confirm the checked-out branch is `011-fix-missing-migration-snapshot-files` and the worktree is clean with `git status`.
- [X] T002 [P] List `drizzle/migrations/NNNN_*.sql` and `drizzle/migrations/meta/NNNN_snapshot.json` to identify missing snapshot numbers.
- [X] T003 [P] Inspect `drizzle/migrations/meta/_journal.json` to confirm existing journal entries cover migrations `0007`, `0008`, `0010`, `0011`, `0012`, and `0013`.

## Phase 2: Foundational

**Purpose**: Establish source-of-truth evidence before restoring metadata.

- [X] T004 Verify SQL-introducing commit hashes for restored migrations using `git log --diff-filter=A -- drizzle/migrations/NNNN_*.sql` and compare against `specs/011-fix-missing-migration-snapshot-files/research.md`.
- [X] T005 Inspect neighboring snapshot files in `drizzle/migrations/meta/` to preserve the existing Drizzle snapshot JSON shape and dialect format.

## Phase 3: User Story 1 - Restore Migration Snapshot Continuity (Priority: P1) MVP

**Goal**: Every migration SQL file has a matching snapshot file.

**Independent Test**: Compare SQL migration prefixes to snapshot prefixes and confirm the missing set is empty.

### Implementation for User Story 1

- [X] T006 [US1] Restore `drizzle/migrations/meta/0007_snapshot.json` representing schema state after `drizzle/migrations/0007_identity_access_rls.sql`.
- [X] T007 [US1] Restore `drizzle/migrations/meta/0008_snapshot.json` representing schema state after `drizzle/migrations/0008_audit_transport_source.sql`.
- [X] T008 [US1] Restore `drizzle/migrations/meta/0010_snapshot.json` representing schema state after `drizzle/migrations/0010_governance_objectives.sql`.
- [X] T009 [US1] Restore `drizzle/migrations/meta/0011_snapshot.json` representing schema state after `drizzle/migrations/0011_governance_rls.sql`.
- [X] T010 [US1] Restore `drizzle/migrations/meta/0012_snapshot.json` representing schema state after `drizzle/migrations/0012_prompt_registry_projects.sql`.
- [X] T011 [US1] Restore `drizzle/migrations/meta/0013_snapshot.json` representing schema state after `drizzle/migrations/0013_prompt_registry_prompts.sql`.
- [X] T012 [US1] Run SQL-to-snapshot parity check for `drizzle/migrations/` and confirm no missing snapshot numbers remain.

## Phase 4: User Story 2 - Preserve Historical Provenance (Priority: P2)

**Goal**: Reviewers can trace every restored snapshot to the SQL-introducing commit.

**Independent Test**: For each restored snapshot, provenance evidence names the matching SQL file, commit hash, and commit subject.

### Implementation for User Story 2

- [X] T013 [US2] Ensure `specs/011-fix-missing-migration-snapshot-files/research.md` contains verified provenance for restored migrations `0007`, `0008`, `0010`, `0011`, `0012`, and `0013`.
- [X] T014 [US2] Confirm the final diff does not modify historical SQL files or `drizzle/migrations/meta/_journal.json`.

## Phase 5: User Story 3 - Verify Future Migration Generation Is Clean (Priority: P3)

**Goal**: Future Drizzle generation diffs only intentional new schema changes.

**Independent Test**: A temporary schema change followed by `pnpm db:generate` produces only the expected temporary DDL and no historical DDL.

### Implementation for User Story 3

- [X] T015 [US3] Run baseline `pnpm db:generate` and confirm it does not emit already-applied historical DDL after restored snapshots are present.
- [X] T016 [US3] Add a temporary schema-only change in an existing Drizzle schema file under `src/`.
- [X] T017 [US3] Run `pnpm db:generate` and inspect the generated migration SQL to confirm it contains only the temporary schema change.
- [X] T018 [US3] Revert the temporary schema edit and remove generated verification migration SQL, snapshot, and journal changes.
- [X] T019 [US3] Confirm `git status` and `git diff --stat` show no temporary verification artifacts.

## Final Phase: Polish & Cross-Cutting

- [X] T020 Run the quickstart validation steps from `specs/011-fix-missing-migration-snapshot-files/quickstart.md`.
- [X] T021 Run the project finish pipeline via `as-finish` and address any failures.
- [X] T022 Update `specs/011-fix-missing-migration-snapshot-files/tasks.md` so all completed tasks are checked off.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks snapshot restoration.
- **User Story 1 (Phase 3)**: Depends on provenance and snapshot-format inspection.
- **User Story 2 (Phase 4)**: Depends on restored snapshot set and verified commit evidence.
- **User Story 3 (Phase 5)**: Depends on snapshot parity from User Story 1.
- **Polish (Final Phase)**: Depends on all user stories.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational phase.
- **User Story 2 (P2)**: Can start after Foundational phase but final diff check depends on US1.
- **User Story 3 (P3)**: Depends on US1 because generation behavior requires restored snapshots.

### Parallel Opportunities

- T002 and T003 can run in parallel because they inspect different migration metadata surfaces.
- Snapshot restoration tasks T006-T011 are sequential in migration order because each snapshot represents cumulative schema state.
- Provenance documentation T013 can be reviewed in parallel with final diff checks after snapshots exist.

## Parallel Example: Setup

```bash
Task: "List SQL and snapshot prefixes in drizzle/migrations"
Task: "Inspect drizzle/migrations/meta/_journal.json for affected entries"
```

## Implementation Strategy

Complete the MVP first by restoring snapshot continuity in migration order and proving SQL-to-snapshot parity. Then verify provenance evidence and run a temporary schema-generation smoke test. Remove all temporary verification changes before final validation and commit only the restored metadata plus Spec Kit documentation.
