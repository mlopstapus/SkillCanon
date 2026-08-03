# Feature Specification: Fix Missing Migration Snapshot Files

**Feature Branch**: `011-fix-missing-migration-snapshot-files`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Fix missing Drizzle migration snapshot files for migrations 0007, 0008, 0010, 0011, and 0013. Identify the commits that introduced the matching SQL migrations without snapshots, regenerate only the missing snapshot metadata so every migration SQL file has a matching meta snapshot, and verify future db generation diffs only the actual schema change being made."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Restore Migration Snapshot Continuity (Priority: P1)

As a developer preparing a database schema change, I need the migration snapshot history to be complete so generation starts from the real latest schema state instead of replaying already-applied DDL.

**Why this priority**: This removes the current blocker where any new migration can include unrelated historical schema changes.

**Independent Test**: Compare migration SQL files to migration snapshot files and confirm every migration number has a matching snapshot.

**Acceptance Scenarios**:

1. **Given** the repository contains migration SQL files `0000` through `0024`, **When** migration metadata files are listed, **Then** every migration number has a matching `meta/NNNN_snapshot.json`.
2. **Given** the issue originally named missing snapshots `0007`, `0008`, `0010`, `0011`, and `0013`, **When** the repository is inspected, **Then** any additional missing snapshot required for full parity is also restored; current inspection also shows `0012_snapshot.json` is missing.

---

### User Story 2 - Preserve Historical Provenance (Priority: P2)

As a maintainer auditing the migration history, I need each restored snapshot to be traceable to the commit that introduced the matching SQL migration so the repair can be reviewed against the historical change that should have produced it.

**Why this priority**: Regenerated metadata is only trustworthy if reviewers can connect it to the migration it represents.

**Independent Test**: For each restored snapshot number, verify the implementation notes or review evidence identify the commit that first added the matching SQL migration.

**Acceptance Scenarios**:

1. **Given** a restored snapshot file, **When** reviewers inspect the implementation evidence, **Then** they can see the commit hash and subject for the corresponding SQL migration introduction.
2. **Given** the restored snapshots are reviewed, **When** a commit provenance entry is checked, **Then** it maps to the same migration number and SQL filename as the snapshot.

---

### User Story 3 - Verify Future Migration Generation Is Clean (Priority: P3)

As a developer making the next schema change, I need migration generation to produce only the intentional new change so unrelated bounded contexts are not bundled into the new migration.

**Why this priority**: The fix is complete only if it changes future generation behavior, not just file parity.

**Independent Test**: Make a temporary, reversible schema change and run migration generation; the generated diff includes only that temporary change and no historical DDL from already-applied migrations.

**Acceptance Scenarios**:

1. **Given** snapshot continuity is restored, **When** a temporary schema-only change is introduced and migration generation is run, **Then** the generated migration contains only that temporary change.
2. **Given** the temporary verification change has been used, **When** the final branch is prepared, **Then** no temporary schema or generated verification migration remains committed.

### Edge Cases

- If the repository contains a SQL migration whose number is not listed in the issue but lacks a matching snapshot, the repair must include it or explicitly prove it is exempt from snapshot parity.
- If a migration is historical and already applied to real databases, the repair must not alter its SQL body or journal ordering.
- If the regeneration command creates additional snapshot or SQL files outside the missing set, those extras must be investigated and removed unless they are required to satisfy full parity.
- If the latest schema and restored snapshots still produce historical DDL in a generated diff, the feature is not complete.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST contain a `drizzle/migrations/meta/NNNN_snapshot.json` file for every `drizzle/migrations/NNNN_*.sql` file.
- **FR-002**: The repair MUST restore the missing snapshots for `0007`, `0008`, `0010`, `0011`, and `0013`.
- **FR-003**: The repair MUST include any other missing snapshot needed to satisfy full SQL-to-snapshot parity; current repository inspection also identifies missing `0012_snapshot.json`.
- **FR-004**: The implementation evidence MUST identify the commit that introduced each SQL migration whose snapshot is restored. Current inspected provenance is:
  - `0007_identity_access_rls.sql`: `10503ae25d88e9e2cbcc5dd15e7ec829302b0cde` - `feat(identity-access): enable Postgres RLS across identity_access tables`
  - `0008_audit_transport_source.sql`: `61f99a0e57dcedfad7bb26f493a41bb09269be5a` - `feat(audit): retrofit identity mutations`
  - `0010_governance_objectives.sql`: `7b597e41fa2badce4693085f4d23e00b3089a1e0` - `feat(governance): add objective CRUD model`
  - `0011_governance_rls.sql`: `cfc2ded7072655d8b024be52095e23707b769e29` - `feat(governance): enforce tenant isolation with RLS`
  - `0012_prompt_registry_projects.sql`: `6f207403e68f568b927a120435f5013b73ae275a` - `feat(prompt-registry): add project model and membership`
  - `0013_prompt_registry_prompts.sql`: `b94f9fac689e685b368e4a20ebcdf89724414639` - `feat(prompt-registry): add org-scoped Prompt & Version model`
- **FR-005**: Restored snapshots MUST represent the schema state after their corresponding historical migration is applied in migration order.
- **FR-006**: Existing migration SQL files and the migration journal order MUST remain unchanged unless required to correct an independently verified mismatch.
- **FR-007**: Migration generation against the current schema MUST no longer emit already-applied historical DDL caused by missing snapshots.
- **FR-008**: Verification artifacts created only to prove clean future generation MUST be removed before final handoff.

### Key Entities

- **Migration SQL File**: A numbered database migration file under `drizzle/migrations/` that represents an applied schema transition.
- **Migration Snapshot File**: A numbered metadata file under `drizzle/migrations/meta/` that captures schema state for the corresponding migration number.
- **Migration Journal**: The ordered metadata list that records migration tags and sequence.
- **Verification Schema Change**: A temporary, reversible schema edit used only to prove future migration generation diffs are minimal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A file parity check reports zero migration numbers with SQL files but missing snapshot files.
- **SC-002**: The restored snapshot set includes at least `0007`, `0008`, `0010`, `0011`, and `0013`, plus any additional missing snapshot required for full parity.
- **SC-003**: A temporary schema change followed by migration generation produces a diff containing only that temporary schema change and no historical DDL from already-applied migrations.
- **SC-004**: The final committed diff contains restored snapshot metadata and any necessary review documentation only; it does not contain temporary verification schema changes or temporary generated migrations.

## Assumptions

- The existing migration SQL files are already applied in real databases and must be treated as historical source of truth.
- Snapshot parity is determined by matching the four-digit migration prefix between SQL files and snapshot files.
- The migration journal already records the affected migration numbers and should preserve its current ordering unless implementation proves it is inconsistent.
- It is acceptable for Builder to use repository history, local tooling, or a reconstructed historical schema sequence to regenerate snapshots, as long as the resulting files satisfy parity and clean-generation verification.
