---

description: "Task list for feature implementation"
---

# Tasks: Audit Query & Retention

**Input**: Design documents from `/specs/015-audit-query-retention/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/audit-query-retention.md, quickstart.md

**Tests**: Included and REQUIRED — constitution Principle I mandates failing tests before backend logic.

## Phase 1: Foundational

**Purpose**: Shared domain types/errors and repo primitives needed by every user story.

- [X] T001 [P] Add query/export/prune public types, pagination constants, and `AuditExportEntitlementRequiredError`/`UnsupportedAuditExportFormatError` in `src/bcs/audit-compliance/domain/audit-event.ts`
- [X] T002 [P] Write failing repo tests in `src/bcs/audit-compliance/infrastructure/audit-events-repo.test.ts` for paginated org-scoped query, retention cutoff exclusion, filter predicates, transport JSON filter, and delete-before-cutoff behavior
- [X] T003 Implement repo helpers in `src/bcs/audit-compliance/infrastructure/audit-events-repo.ts`: `queryByOrganization`, `countByOrganization`, and `deleteOlderThan` with all filters ANDed together

## Phase 2: User Story 1 - Search and filter the organization's audit trail (Priority: P1)

**Goal**: Return one organization's currently-retained audit events in bounded pages with all filter dimensions available.

**Independent Test**: Seed two orgs and varied audit rows; prove each filter alone and combined returns exactly the matching rows and never leaks another org.

- [X] T004 [P] [US1] Write failing application tests for `listAuditEvents` in `src/bcs/audit-compliance/application/list.test.ts`: no-filter pagination, tenant isolation, retention cutoff, search including human actor display name, resource type, actor user/API key, transport, date range, combined filters, and page beyond last
- [X] T005 [US1] Implement `listAuditEvents` in `src/bcs/audit-compliance/application/list.ts` using the hardcoded 7-day retention default and repo query/count helpers
- [X] T006 [US1] Export `listAuditEvents` and related filter/page types from `src/bcs/audit-compliance/index.ts`

## Phase 3: User Story 2 - Retention pruning records itself (Priority: P1)

**Goal**: Delete old events for one org and write exactly one transactional `audit.pruned` system event, even when zero rows are deleted.

**Independent Test**: Seed old/new rows, run prune, and verify old rows are gone, new rows remain, one prune row exists, and a zero-delete run still records one row.

- [X] T007 [P] [US2] Write failing tests for `pruneAuditEvents` in `src/bcs/audit-compliance/application/prune.test.ts`: deletes old rows only, ignores other orgs, writes one prune event with deleted count, writes zero-count event, and rolls back deletion if the prune event insert fails
- [X] T008 [US2] Implement `pruneAuditEvents` in `src/bcs/audit-compliance/application/prune.ts` with one DB transaction around `deleteOlderThan` plus `record`
- [X] T009 [US2] Export `pruneAuditEvents` from `src/bcs/audit-compliance/index.ts`

## Phase 4: User Story 3 - Export the audit trail (Priority: P2)

**Goal**: Export is CSV-capable but fail-closed without the export entitlement.

**Independent Test**: The default hardcoded entitlement rejects export and produces no body; CSV generation remains covered behind an injected test entitlement path or local formatter test.

- [X] T010 [P] [US3] Write failing tests for `exportAuditEvents` in `src/bcs/audit-compliance/application/export.test.ts`: default export rejection, unsupported format rejection, and CSV escaping/headers for retained org-scoped rows via a formatter helper
- [X] T011 [US3] Implement `exportAuditEvents` in `src/bcs/audit-compliance/application/export.ts` for CSV only, using the same retention-scoped repo query as list and failing closed by default
- [X] T012 [US3] Export `exportAuditEvents` and export errors from `src/bcs/audit-compliance/index.ts`

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T013 Update `src/bcs/audit-compliance/CONTRACT.md` with concrete list/export/prune signatures, the temporary 7-day/no-export entitlement behavior, and the `audit.pruned` payload
- [X] T014 Update `backlog/003-audit-compliance/002-audit-query-and-retention.md`: check off delivered requirements/acceptance criteria and move to `backlog/003-audit-compliance/archive/002-audit-query-and-retention.md` with `status: done`
- [X] T015 Run quickstart checks from `specs/015-audit-query-retention/quickstart.md`, then `pnpm test`, `pnpm typecheck`, and `pnpm lint`; fix failures

## Dependencies & Execution Order

- Foundational T001-T003 block every user story.
- US1 and US2 both depend on repo helpers; they can be implemented independently after Foundational.
- US3 depends on the list-style retained query helper but not on the US1 application function.
- Polish depends on all user stories.

## Parallel Opportunities

- T001 and T002 touch different files and can run together.
- T004, T007, and T010 can be written in parallel after Foundational.
- T013 and T014 can run after exports are finalized.

## Implementation Strategy

1. Complete Foundational repo/domain behavior.
2. Deliver US1 as MVP: tenant-safe retained query and all filters.
3. Deliver US2: transactional pruning and visible prune event.
4. Deliver US3: fail-closed CSV export.
5. Run the focused quickstart and full finish pipeline.
