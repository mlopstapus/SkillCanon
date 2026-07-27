# Tasks: Prompt & Version Model

**Feature**: 018-prompt-version-model
**Branch**: `018-prompt-version-model`
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

---

## Phase 1: Setup

- [X] T001 Verify project environment (Node.js, pnpm, TypeScript, Vitest, Drizzle all configured — existing project)

---

## Phase 2: Foundational

- [X] T002 Add `published` verb to `AUDIT_ACTION_VERBS` and its color entry in `AUDIT_ACTION_VERB_COLORS` in `src/bcs/audit-compliance/domain/audit-event.ts`
- [X] T003 Extend `src/bcs/prompt-registry/infrastructure/schema.ts` with `prompts` and `promptVersions` Drizzle table definitions
- [X] T004 Create `src/bcs/prompt-registry/domain/prompt.ts` with types, error classes, and `PromptIdentityVerifier` interface
- [X] T005 Create `src/bcs/prompt-registry/infrastructure/prompts-repo.ts` with raw queries: `insertPrompt`, `findPromptByOrgAndName`, `findPromptByOrgAndId`, `listPromptsByOrg`, `updatePrompt`
- [X] T006 Create `src/bcs/prompt-registry/infrastructure/prompt-versions-repo.ts` with raw queries: `insertPromptVersion`, `findVersionByPromptAndLabel`, `findVersionById`, `listVersionsByPrompt`
- [X] T007 Create `src/bcs/prompt-registry/application/prompt-test-helpers.ts` with `makePromptFixtureOrg`, `verifierFor`, `queryPromptRows`, `queryPromptVersionRows`, `queryPromptAuditEvents`

---

## Phase 3: User Story 1 — Create and read organization-scoped prompts (P1)

**Goal**: Callers can create named prompts in their org and retrieve/list them without colliding with other orgs.

**Independent Test**: Create prompt `commit` in org A and org B — both succeed. Attempt second `commit` in org A — rejected.

- [X] T008 [US1] Create `src/bcs/prompt-registry/application/create-prompt.ts` — `createPrompt(db, actor, params, verifier, auditContext?)` with org-scoped uniqueness check and `PromptCreated` audit event
- [X] T009 [P] [US1] Create `src/bcs/prompt-registry/application/create-prompt.test.ts` — tests: creates prompt with audit event, cross-org same name succeeds, duplicate name in same org rejected, owner from other org rejected
- [X] T010 [P] [US1] Create `src/bcs/prompt-registry/application/get-prompt.ts` — `getPrompt(db, actor, name): PromptSummary | null`
- [X] T011 [P] [US1] Create `src/bcs/prompt-registry/application/get-prompt.test.ts` — tests: returns own org prompt, returns null for other org prompt (isolation)
- [X] T012 [P] [US1] Create `src/bcs/prompt-registry/application/list-prompts.ts` — `listPrompts(db, actor): PromptSummary[]`
- [X] T013 [P] [US1] Create `src/bcs/prompt-registry/application/list-prompts.test.ts` — tests: lists only own-org prompts, other-org prompts not included

---

## Phase 4: User Story 2 — Publish immutable prompt versions (P2)

**Goal**: Callers publish new versions; existing version rows are never modified.

**Independent Test**: Create prompt, publish two versions, confirm active_version advances, confirm no update path exists.

- [X] T014 [US2] Create `src/bcs/prompt-registry/application/publish-version.ts` — `publishVersion(db, actor, params)` inserts PromptVersion, updates prompt.active_version_id, emits `PromptVersionPublished` audit event
- [X] T015 [P] [US2] Create `src/bcs/prompt-registry/application/publish-version.test.ts` — tests: publishes version with audit event, active_version advances, prior version unchanged, cross-org rejected
- [X] T016 [P] [US2] Create `src/bcs/prompt-registry/application/list-versions.ts` — `listVersions(db, actor, promptName): PromptVersionSummary[]`
- [X] T017 [P] [US2] Create `src/bcs/prompt-registry/application/list-versions.test.ts` — tests: all published versions returned, other-org versions not returned
- [X] T018 [P] [US2] Create `src/bcs/prompt-registry/application/prompt-characterization.test.ts` — characterization test: assert no `updatePromptVersion`/`updateVersion` export exists in the application layer

---

## Phase 5: User Story 3 — Manage prompt lifecycle and rollback (P3)

**Goal**: Callers deprecate prompts and roll back active version without altering version history.

**Independent Test**: Publish 3 versions, rollback to v1, confirm only active_version_id changes, all 3 versions intact.

- [X] T019 [US3] Create `src/bcs/prompt-registry/application/deprecate-prompt.ts` — `deprecatePrompt(db, actor, name)` sets `is_deprecated = true`
- [X] T020 [P] [US3] Create `src/bcs/prompt-registry/application/deprecate-prompt.test.ts` — tests: marks deprecated in own org, cross-org rejected
- [X] T021 [US3] Create `src/bcs/prompt-registry/application/rollback-prompt.ts` — `rollbackPrompt(db, actor, promptName, targetVersion)` repoints `active_version_id`, no version row changes
- [X] T022 [P] [US3] Create `src/bcs/prompt-registry/application/rollback-prompt.test.ts` — tests: rollback changes active_version only, nonexistent version rejected, cross-prompt version rejected, cross-org rejected, all versions intact after rollback

---

## Phase 6: Polish & Cross-Cutting

- [X] T023 Extend `src/bcs/prompt-registry/index.ts` to re-export all new public types, errors, and functions
- [X] T024 Generate and apply Drizzle migration for `prompt_registry.prompts` and `prompt_registry.prompt_versions` tables
- [X] T025 Run full test suite and fix any failures (`pnpm vitest run`)

---

## Dependencies

```
T002 → T003 (audit verb must exist before publishing functions use it)
T003 → T004, T005, T006 (schema needed by repos and domain)
T004 → T005, T006, T007 (types needed by repos and helpers)
T005, T006, T007 → T008...T022 (repos and helpers needed by all app functions)
T008...T022 → T023 (implementations needed before index re-export)
T023 → T024 → T025
```

## Parallel Execution

Within each phase, tasks marked `[P]` can run in parallel (different files).

Phase 3: T009, T010, T011, T012, T013 can run in parallel after T008.
Phase 4: T015, T016, T017, T018 can run in parallel after T014.
Phase 5: T020, T021 can run in parallel; T022 after T021.

## Implementation Strategy

MVP = Phase 3 (US1: create + get + list prompts with org isolation). Each subsequent phase is an independently testable increment.
