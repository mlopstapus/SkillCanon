# Feature Specification: Eval Case Format

**Feature Branch**: `feat/017-002-eval-case-format`
**Created**: 2026-10-30
**Status**: Draft
**Input**: backlog 017/002. A skill version may carry a supporting file `evals/cases.yaml` of eval cases; publishing validates its shape and a malformed file blocks publish with a 422. Per PDR-020 evals run centrally; this feature defines and validates the format only.

## User Scenarios & Testing

### User Story 1 - Publish a version with eval cases (Priority: P1)
A skill owner adds `evals/cases.yaml` to a version. Each case has an `input` and either deterministic `assert` checks (contains, regex, json_schema) or a `rubric` for a judge model. A well-formed file publishes normally.

**Independent Test**: publish a version whose supporting files include a valid `evals/cases.yaml`; it succeeds and the file is stored like any other supporting file.

**Acceptance Scenarios**:
1. **Given** a file with a case using `assert: [{contains: "x"}]`, **When** publishing, **Then** it succeeds.
2. **Given** a case using `rubric: "Is the answer polite?"`, **When** publishing, **Then** it succeeds.

### User Story 2 - Malformed eval file is rejected (Priority: P1)
A malformed `evals/cases.yaml` blocks publish with HTTP 422 and a message that names the problem.

**Acceptance Scenarios**:
1. **Given** invalid YAML, a missing `cases` list, a case without `input`, a case with both or neither of `assert`/`rubric`, an unknown assertion type, or a regex that does not compile, **When** publishing, **Then** publish fails with 422 and no version is created.

### Edge Cases
- A version with no `evals/cases.yaml` is unaffected.
- The file is only validated, never executed, here.

## Requirements

- **FR-001**: The file `evals/cases.yaml` is the only recognised eval file name; it is stored as an ordinary supporting file.
- **FR-002**: Top level is a mapping with a non-empty `cases` list.
- **FR-003**: Each case has a non-empty string `input`, an optional unique string `name`, and exactly one of `assert` (non-empty list) or `rubric` (non-empty string).
- **FR-004**: Each assertion is a single-key mapping: `contains` (non-empty string), `regex` (a pattern that compiles), or `json_schema` (a mapping).
- **FR-005**: Any violation rejects the publish with the existing 422 invalid-version-files error naming the case and problem.

## Success Criteria
- **SC-001**: 100% of malformed files in the test matrix are rejected with 422 and create no version.
- **SC-002**: Versions without the file publish exactly as before.

## Assumptions
- No runner, job table or migration (017/003+, PDR-020).
- Judge-model configuration is a runner concern, not part of the file.
