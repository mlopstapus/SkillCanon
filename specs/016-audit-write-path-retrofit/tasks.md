# Tasks: Audit Write Path Retrofit, Transport/Source Tracking & Action Vocabulary

**Input**: Design documents from `/specs/016-audit-write-path-retrofit/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/audit-write-path.md`, `quickstart.md`

**Tests**: Required by spec success criteria and constitution P1. Write/adjust tests before implementation in each phase.

**Organization**: Tasks are grouped by user story so the audit coverage retrofit, transport/source enrichment, and verb vocabulary can be verified independently.

## Phase 1: Setup

**Purpose**: Confirm current migration/test layout and establish the shared audit context shape.

- [X] T001 Inspect existing audit migration snapshots and choose the next migration number in `drizzle/migrations/`
- [X] T002 [P] Add shared audit context/type exports in `src/bcs/audit-compliance/domain/audit-event.ts`

---

## Phase 2: Foundational

**Purpose**: Add transport/source storage and make `record()` require it before any retrofit work lands.

- [X] T003 [P] Write failing transport/source schema assertions in `src/bcs/audit-compliance/infrastructure/audit-events-repo.test.ts`
- [X] T004 [P] Write failing `record()` tests for required `transport`, stored `sourceIp`, and continued redaction in `src/bcs/audit-compliance/application/record.test.ts`
- [X] T005 Add `transport` and `source_ip` to `audit.audit_events` in `src/bcs/audit-compliance/infrastructure/schema.ts`
- [X] T006 Add the SQL migration for `transport` and `source_ip` in `drizzle/migrations/0008_audit_transport_source.sql`
- [X] T007 Update `NewAuditEvent`, repository insert mapping, and `record()` validation in `src/bcs/audit-compliance/domain/audit-event.ts`, `src/bcs/audit-compliance/infrastructure/audit-events-repo.ts`, and `src/bcs/audit-compliance/application/record.ts`
- [X] T008 Update existing direct audit tests/call sites for login/logout/invitations/API keys to pass real transport/source fields in `src/bcs/identity-access/application/*.ts` and matching tests

**Checkpoint**: Audit storage and every existing `record()` call supports real transport/source values.

---

## Phase 3: User Story 1 - Every identity mutation appears in the audit trail (Priority: P1)

**Goal**: Organization, team, and user mutations write exactly one transactionally coupled audit event.

**Independent Test**: Run the identity-access mutation tests and confirm each success writes one audit row, while forced failures leave none.

### Tests for User Story 1

- [X] T009 [P] [US1] Add organization creation/bootstrap audit success and rollback tests in `src/bcs/identity-access/application/create-organization.test.ts`, `bootstrap-organization.test.ts`, and `register-first-run-admin.test.ts`
- [X] T010 [P] [US1] Add team create/update/reparent/insert-between audit success and rollback tests in `src/bcs/identity-access/application/create-team.test.ts`, `update-team.test.ts`, `reparent-team.test.ts`, and `insert-team-between.test.ts`
- [X] T011 [P] [US1] Add user create/update/deactivate audit success and rollback tests in `src/bcs/identity-access/application/create-user.test.ts`, `update-user.test.ts`, and `deactivate-user.test.ts`

### Implementation for User Story 1

- [X] T012 [US1] Wrap organization creation/bootstrap mutations with `withAudit()` and `record()` in `src/bcs/identity-access/application/create-organization.ts`, `bootstrap-organization.ts`, `register-first-run-admin.ts`, and `provision-team-and-admin.ts`
- [X] T013 [US1] Wrap team create/update/reparent/insert-between mutations with `withAudit()` and `record()` in `src/bcs/identity-access/application/create-team.ts`, `update-team.ts`, `reparent-team.ts`, and `insert-team-between.ts`
- [X] T014 [US1] Wrap user create/update/deactivate mutations with `withAudit()` and `record()` in `src/bcs/identity-access/application/create-user.ts`, `update-user.ts`, `deactivate-user.ts`, and any shared insert helper as needed
- [X] T015 [US1] Verify each retrofitted mutation writes before/after payloads that avoid secret material in `src/bcs/identity-access/application/*.test.ts`

**Checkpoint**: User Story 1 works independently and closes the main audit coverage gap.

---

## Phase 4: User Story 2 - Knowing which surface a change came from (Priority: P2)

**Goal**: Every existing and new audit event has `transport` and optional `source_ip` populated from a real context.

**Independent Test**: Exercise direct auth, invitation, API-key, organization, team, and user audit call sites with web/api/cli/system contexts where applicable and verify stored values.

### Tests for User Story 2

- [X] T016 [P] [US2] Add call-site tests proving existing login/logout/invitation/API-key events store transport/source in `src/bcs/identity-access/application/*test.ts`
- [X] T017 [P] [US2] Add retrofitted mutation tests proving passed audit context reaches storage in organization/team/user test files under `src/bcs/identity-access/application/`

### Implementation for User Story 2

- [X] T018 [US2] Add optional audit context parameters with conservative web defaults to audited identity application service signatures in `src/bcs/identity-access/application/*.ts`
- [X] T019 [US2] Thread explicit audit context through API-key create/revoke services in `src/bcs/identity-access/application/create-api-key.ts` and `revoke-api-key.ts`, defaulting current session-originated callers to `web` while preserving an explicit `api` option for future API-key-authenticated calls
- [X] T020 [US2] Ensure `system` context remains representable for future retention-pruning events via exported types in `src/bcs/audit-compliance/domain/audit-event.ts`

**Checkpoint**: User Story 2 works independently and all current audit rows carry source metadata.

---

## Phase 5: User Story 3 - Documented action verb vocabulary (Priority: P3)

**Goal**: Engineers and the future audit UI can rely on one documented verb/color reference.

**Independent Test**: Compare shipped `action` strings to the documented verbs and confirm no undocumented current verb is used.

### Tests for User Story 3

- [X] T021 [P] [US3] Add a documentation/code consistency test for produced audit action verbs in `src/bcs/audit-compliance/application/record.test.ts` or a dedicated `src/bcs/audit-compliance/domain/audit-event.test.ts`

### Implementation for User Story 3

- [X] T022 [US3] Document canonical action verbs and UI color-coding in `src/bcs/audit-compliance/CONTRACT.md`
- [X] T023 [US3] Export canonical action verb/color metadata from `src/bcs/audit-compliance/domain/audit-event.ts` if needed by the consistency test

**Checkpoint**: User Story 3 works independently and the contract is a single source for verb guidance.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Validate the feature and keep generated artifacts consistent.

- [X] T024 [P] Update `specs/016-audit-write-path-retrofit/quickstart.md` if focused verification commands change during implementation
- [X] T025 Run focused verification from `specs/016-audit-write-path-retrofit/quickstart.md`
- [X] T026 Run full project checks: `pnpm lint`, `pnpm typecheck`, and `pnpm test`
- [X] T027 Review `rg "record\(" src` and `rg "action:" src/bcs` to confirm no missing transport or undocumented current verb remains

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 has no dependencies.
- Phase 2 depends on Phase 1 and blocks all user stories because `transport` becomes required everywhere.
- User Story 1 depends on Phase 2.
- User Story 2 depends on Phase 2 and can be implemented alongside User Story 1 once context parameters exist.
- User Story 3 depends on Phase 2 and can be implemented independently of the identity mutation retrofit.
- Final Phase depends on all selected user stories.

### User Story Dependencies

- **US1 (P1)**: Requires foundational transport/schema work; no dependency on US2/US3.
- **US2 (P2)**: Requires foundational transport/schema work; can share service signature edits with US1.
- **US3 (P3)**: Requires knowing current action strings; no dependency on mutation retrofit internals.

### Parallel Opportunities

- T002, T003, T004 can be done in parallel.
- T009, T010, T011 can be written in parallel across different mutation groups.
- T016 and T017 can be written in parallel once foundational storage is available.
- T021 and T022 can be done in parallel with identity retrofit implementation.

## Implementation Strategy

1. Complete Phase 1 and Phase 2 first so every call site is forced onto the new audit event shape.
2. Implement US1 as the MVP because it closes the largest compliance gap.
3. Complete US2 source metadata tests once the retrofitted call sites exist.
4. Complete US3 documentation/metadata and run the quickstart/full checks.
