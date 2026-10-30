# Feature Specification: Normalise Skill Version Labels

**Feature Branch**: `fix/version-format`
**Created**: 2026-10-29
**Status**: Draft
**Source**: `backlog/015-distribution-correctness/007-ui-defects.md`, first bullet

## User Scenarios & Testing

### User Story 1 - One label format everywhere (Priority: P1)

A skill author publishes versions through the web UI (which used to store `v1`) and through REST (which stores whatever is sent, e.g. `1`). Every screen shows the same, single form of the label, and the Metrics page no longer shows `vv1`.

**Acceptance Scenarios**:

1. **Given** a publish request with label `v1`, **When** it is stored, **Then** the stored label is `1`.
2. **Given** version `1` exists, **When** someone publishes `v1` for the same skill, **Then** it is rejected as a duplicate.
3. **Given** a skill with a stored version `1`, **When** Metrics lists its usage, **Then** the label reads `1` (never `vv1`).

### User Story 2 - Existing references keep working (Priority: P1)

An existing chain step pinned to `v1`, or a CLI/REST request for `v1`, still resolves to the stored version.

**Acceptance Scenarios**:

1. **Given** stored version `1`, **When** it is looked up by `v1`, **Then** it is found.

### User Story 3 - Existing data is migrated (Priority: P2)

**Acceptance Scenarios**:

1. **Given** rows labelled `v1`/`v2` in skill versions, chain-run steps and usage records, **When** the migration runs, **Then** they read `1`/`2`.
2. **Given** a skill that already has both `v1` and `1`, **When** the migration runs, **Then** its `v1` row is left untouched (no uniqueness violation).

## Requirements

- **FR-001**: Publishing normalises the label by removing one leading `v`/`V` that is immediately followed by a digit; labels like `vNext` are untouched.
- **FR-002**: Duplicate detection and lookup by label compare normalised labels.
- **FR-003**: A migration rewrites existing prefixed labels in skill versions, chain-run steps and usage records, skipping skill-version rows whose normalised label already exists for that skill.
- **FR-004**: The Metrics page renders the stored label without adding a prefix.
- **FR-005**: The UI's next-version suggestion and the initial publishes use the plain form (`2`, `1`) and still count existing `v`-prefixed labels.

## Success Criteria

- No page shows a doubled prefix (`vv1`); the e2e check for it passes.
- Existing keys, pinned chain steps and CLI requests using `v1` keep working.

## Assumptions / Out of scope

- Canonical form is the un-prefixed label (per the backlog item).
- Scope values, MCP, audit transport are other items.
- Pinned `v1` inside chain-step JSON is not rewritten; lookup normalisation covers it.
