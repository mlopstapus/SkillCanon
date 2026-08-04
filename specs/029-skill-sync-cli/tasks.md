---

description: "Task list for feature implementation"
---

# Tasks: Skill Sync CLI

**Input**: Design documents from `/specs/029-skill-sync-cli/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli-commands.md, quickstart.md

**Tests**: Included. Not explicitly requested in spec.md, but this repo's constitution (Principle I, Test-First Development) and established convention apply test-first development to all new logic; every implementation task below is preceded by a failing-test task for the same unit.

**Organization**: Tasks are grouped by user story (spec.md's P1/P2/P3) to enable independent implementation and testing of each story.

## Path Conventions

All paths are under the new standalone `cli/` package (plan.md's Project Structure) — independent of the root Next.js app's `src/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the new, independent `cli/` package.

- [ ] T001 Create `cli/` package skeleton: `cli/package.json` (name `skillcanon`, `bin` entry, `type: module`, scripts `build`/`test`/`typecheck`), `cli/tsconfig.json` (strict mode, ES2022+ target matching Node >=24), `cli/.gitignore` (`dist/`, `node_modules/`), and the empty directory tree from plan.md's Project Structure (`src/commands/`, `src/config/`, `src/skills/`, `src/integrations/`, `src/http/`, `test/` with matching subfolders)
- [ ] T002 [P] Add `cli/package.json` dependencies: `commander` (runtime); `typescript`, `vitest`, `@types/node` (dev)
- [ ] T003 [P] Configure `cli/vitest.config.ts`

**Checkpoint**: `cli/` package installs (`pnpm --dir cli install`) and `pnpm --dir cli run typecheck`/`pnpm --dir cli test` run (with zero tests/files) without error.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Local-state and HTTP primitives every command (`init`/`sync`/`run`) depends on. No user-visible CLI behavior yet.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 [P] Write failing tests for project-key URL parsing and `.skillcanon/project.json` read/write in `cli/test/config/project-link.test.ts` (valid URL → `{server, projectId}`; malformed URL/missing UUID path segment → throws a clear error per research.md D1)
- [ ] T005 [P] Implement `cli/src/config/project-link.ts` to pass T004 (data-model.md "Project Link")
- [ ] T006 [P] Write failing tests for `.skillcanon/credentials.json` read/write in `cli/test/config/credentials.test.ts` — asserting file mode `0600` after write, and that no thrown error from the read/write path ever includes the raw key value (FR-003)
- [ ] T007 [P] Implement `cli/src/config/credentials.ts` to pass T006 (data-model.md "Credential")
- [ ] T008 [P] Write failing tests for `.skillcanon/sync-manifest.json` read/write and sha256 hash compute/compare in `cli/test/config/sync-manifest.test.ts`
- [ ] T009 [P] Implement `cli/src/config/sync-manifest.ts` to pass T008 (data-model.md "Sync Record")
- [ ] T010 [P] Write failing tests for slug derivation (lowercase/kebab-case) and `SKILL.md` render/parse (frontmatter `name`/`description` + fixed one-line body) in `cli/test/skills/stub.test.ts`
- [ ] T011 [P] Implement `cli/src/skills/stub.ts` to pass T010 (data-model.md "Skill Stub", research.md D4)
- [ ] T012 [P] Write failing tests for the HTTP client wrapper against a local mock HTTP server in `cli/test/http/skillcanon-client.test.ts` — `listSkills()` sends `Authorization: Bearer` + `?projectId=`; `expandSkill()` POSTs `{input}`; both surface distinguishable error types for network failure vs. non-2xx response, and never include the API key value in any thrown message
- [ ] T013 [P] Implement `cli/src/http/skillcanon-client.ts` to pass T012 (contracts/cli-commands.md `sync`/`run` request shapes)
- [ ] T014 [P] Write failing tests for idempotent `.gitignore` entry insertion in `cli/test/gitignore.test.ts` (adds `.skillcanon/credentials.json` once; re-running does not duplicate the line; preserves existing file content/order)
- [ ] T015 [P] Implement `cli/src/gitignore.ts` to pass T014
- [ ] T016 Wire `cli/src/index.ts`: a `commander` program registering empty `init`/`sync`/`run` subcommands and a top-level error handler that redacts any credential-shaped substring before printing to stderr (defense-in-depth backstop for FR-003, on top of T006/T012's never-include guarantees)

**Checkpoint**: Foundation ready — all local-state and HTTP primitives are implemented and independently tested. User story implementation can now begin.

---

## Phase 3: User Story 1 - Zero-touch skill sync after one-time setup (Priority: P1) 🎯 MVP

**Goal**: `skillcanon init` links a repo to a project and installs automatic sync; the local skill roster stays current with the SkillCanon project with no manual step after that.

**Independent Test**: Run `init` once in a fresh repo against a real (or mocked) SkillCanon project, then simulate a session start (invoke the same command the installed hook runs) — every visible prompt has a working stub, add/rename/remove on the server is reflected after the next simulated session start, with no `sync` run by hand (spec.md US1 Acceptance Scenarios).

### Tests for User Story 1

- [ ] T017 [P] [US1] Write failing end-to-end test for `init` in `cli/test/commands/init.test.ts` (temp dir + mock HTTP server): asserts `.skillcanon/project.json`, `.skillcanon/credentials.json` (mode `0600`), `.gitignore` entry, `.claude/settings.json` `SessionStart` hook, `CLAUDE.md`/`AGENTS.md` blurbs, and a stub per prompt in the mocked roster all exist after one run; asserts re-running `init` is idempotent (no duplicated hook entries/blurbs/gitignore lines — FR-015)
- [ ] T018 [P] [US1] Write failing tests for stub create/update/remove reconciliation (no conflicts) in `cli/test/skills/reconcile.test.ts`: a new server-side prompt produces a new stub; a changed name/description updates an existing stub's frontmatter only; a prompt no longer in the roster removes its stub and manifest entry

### Implementation for User Story 1

- [ ] T019 [US1] Implement `cli/src/skills/reconcile.ts`: diff the server roster (via `listSkills()`) against tracked stubs (via sync-manifest), returning a create/update/remove plan (conflict detection deferred to US3) — to pass T018
- [ ] T020 [US1] Implement `cli/src/integrations/claude-settings.ts`: merge a `SessionStart` hook entry (research.md D6) into `.claude/settings.json`, creating the file if absent, preserving any existing unrelated hooks/settings, idempotent on re-run
- [ ] T021 [US1] Implement `cli/src/integrations/agent-docs.ts`: idempotently insert/replace a SkillCanon blurb between `<!-- skillcanon:start -->`/`<!-- skillcanon:end -->` markers in `CLAUDE.md` and `AGENTS.md`, creating either file if absent
- [ ] T022 [US1] Implement `cli/src/commands/sync.ts`: load project-link + credentials, call `listSkills()`, run `reconcile.ts`'s plan, write/update/remove stub files via `stub.ts`, update the sync manifest — to pass T018's integration surface
- [ ] T023 [US1] Implement `cli/src/commands/init.ts`: parse `--project-key`, prompt (no echo) for `--api-key` if omitted, parse the project-key URL (T005), verify the key authenticates by making one `listSkills()` call, then write project-link + credentials + gitignore entry + `.claude/settings.json` hook + agent-doc blurbs, and finally invoke `sync.ts`'s logic — to pass T017; on any failure before the auth check succeeds, no config files are left behind (contracts/cli-commands.md)
- [ ] T024 [US1] Wire `init`/`sync` into `cli/src/index.ts` with contract-specified exit codes (0 success; 1 on malformed project key or rejected credential)

**Checkpoint**: User Story 1 is fully functional and independently testable — `init` plus a manually-invoked `sync` (standing in for the automatic hook trigger) keep the roster current with no conflicts in the picture yet.

---

## Phase 4: User Story 2 - Manual sync and direct prompt run (Priority: P2)

**Goal**: A developer can force a sync on demand and run a single governed prompt directly from the terminal, seeing live, governed output.

**Independent Test**: In an already-set-up repo, run `sync` manually after a server-side change and confirm immediate reflection; run `run <slug>` and confirm printed output matches current server resolution, including after a policy/objective change (spec.md US2 Acceptance Scenarios).

### Tests for User Story 2

- [ ] T025 [P] [US2] Write failing tests for `run` success path in `cli/test/commands/run.test.ts` (mocked expand endpoint): prints resolved text to stdout only, exit 0; a second run against a changed mocked response reflects the change immediately (no caching anywhere in the CLI)
- [ ] T026 [P] [US2] Write failing test confirming a manually-invoked `skillcanon sync` (not via any hook) produces identical reconciliation results to US1's flow, in `cli/test/commands/sync.test.ts`

### Implementation for User Story 2

- [ ] T027 [US2] Implement `cli/src/commands/run.ts`: parse `<slug>` and optional `--input '<json>'` (default `{}`), call `expandSkill()`, print the resolved text to stdout with nothing else appended — to pass T025 (research.md D5, contracts/cli-commands.md)
- [ ] T028 [US2] Wire `run` into `cli/src/index.ts`, including `--input` JSON-parse validation (malformed JSON → exit 1 before any network call)

**Checkpoint**: User Stories 1 and 2 both independently functional — the full happy path (setup, auto-sync, manual sync, manual run, live governance reflection) works with no conflict/failure handling yet.

---

## Phase 5: User Story 3 - Safe failure and protection of local edits (Priority: P3)

**Goal**: A hand-edited stub is never silently overwritten; every `run` failure mode (expired credential, deleted prompt, offline) fails loudly and distinctly; the automatic session-start sync never blocks startup.

**Independent Test**: Hand-edit a stub and re-sync (edit preserved, flagged, other stubs still update); run against a revoked credential, a deleted prompt, and no network (each a clear non-zero-exit failure, never a stale fallback) (spec.md US3 Acceptance Scenarios).

### Tests for User Story 3

- [ ] T029 [P] [US3] Write failing test for hand-edit conflict detection in `cli/test/skills/reconcile.test.ts`: a stub whose on-disk content no longer matches its last-recorded manifest hash is skipped and flagged, not overwritten, while every other stub in the same run still reconciles normally (FR-010, FR-010a)
- [ ] T030 [P] [US3] Write failing test for slug-collision detection in `cli/test/skills/reconcile.test.ts`: two server-side prompts deriving the same slug are both skipped and flagged, other prompts unaffected
- [ ] T031 [P] [US3] Write failing test for `sync --force` overriding a hand-edit conflict (and only a hand-edit conflict, not a collision) in `cli/test/commands/sync.test.ts`
- [ ] T032 [P] [US3] Write failing tests for `run`'s distinct failure modes in `cli/test/commands/run.test.ts`: expired/invalid credential (401/403), deleted prompt (404), network unreachable, and malformed `--input` — each produces exit 1, a distinct human-readable stderr message, and zero stdout output (FR-009, SC-007)
- [ ] T033 [P] [US3] Write failing test for `sync`'s request-level failure (network/auth) in `cli/test/commands/sync.test.ts`: leaves the existing roster and manifest completely untouched, exits 1 when invoked manually
- [ ] T034 [P] [US3] Write failing test for `sync --quiet` in `cli/test/commands/sync.test.ts`: on the same request-level failure as T033, prints a short warning instead of a full error and its process exit is handled such that the automatic `SessionStart` hook invocation never blocks/fails session startup (FR-013)

### Implementation for User Story 3

- [ ] T035 [US3] Extend `cli/src/skills/reconcile.ts` with hand-edit detection (compare current file hash vs. manifest before touching a stub) and slug-collision detection, each producing a flagged-but-skipped entry in the reconciliation plan — to pass T029/T030
- [ ] T036 [US3] Extend `cli/src/commands/sync.ts`: print one stderr line per flagged conflict (path + reason), support `--force` (bypass hand-edit-only conflicts, per T031) and `--quiet` (research.md D7: request-level failures warn instead of erroring, and never propagate a blocking exit in the automatic-hook path), and distinguish "per-prompt conflict" (exit 0) from "request-level failure" (exit 1, roster untouched) — to pass T031/T033/T034
- [ ] T037 [US3] Extend `cli/src/http/skillcanon-client.ts` and `cli/src/commands/run.ts` error mapping to produce the four distinct messages required by T032 (network, invalid/expired credential, deleted prompt, malformed `--input`), never printing partial/stale stdout in any of them
- [ ] T038 [US3] Update the `SessionStart` hook command installed by `claude-settings.ts` (T020) to invoke `skillcanon sync --quiet`, confirming via T034 that it satisfies FR-013 end-to-end

**Checkpoint**: All three user stories are independently functional. SC-006 (hand-edits never silently lost) and SC-007 (every failure path is loud and distinct) are both covered by passing tests.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Package finishing touches spanning all three stories.

- [ ] T039 [P] Write `cli/README.md`: install, `init`/`sync`/`run` usage, and the project-key-is-a-URL convention (research.md D1), for the separately-published package
- [ ] T040 [P] Add `cli/package.json` build wiring: `tsc` compiling `src/` → `dist/`, a `#!/usr/bin/env node` shebang on the built entry point, `bin` field pointing at it, and executable file permissions set post-build
- [ ] T041 Run `quickstart.md`'s three scenarios manually against a local SkillCanon dev instance and a scratch git repository; record and fix any discrepancy found
- [ ] T042 Run the full `cli` suite (`pnpm --dir cli run typecheck && pnpm --dir cli test`) and confirm all tasks' tests pass together, not just individually

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories — every story's commands import these primitives directly.
- **User Story 1 (Phase 3)**: Depends on Foundational only.
- **User Story 2 (Phase 4)**: Depends on Foundational; `run.ts` (T027/T028) is new and independent of US1's files, but T026 (manual-`sync` parity test) exercises `sync.ts` built in US1 — so Phase 4 should start after Phase 3's `sync.ts` (T022) exists, even though `run.ts` itself has no US1 dependency.
- **User Story 3 (Phase 5)**: Depends on both US1 (`reconcile.ts`, `sync.ts`) and US2 (`run.ts`, error-mapping surface) — it extends those same files rather than introducing new ones, so it cannot start in parallel with them the way US1/US2 mostly can.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- All Setup tasks marked `[P]` (T002, T003).
- All Foundational tasks marked `[P]` (T004–T015) — each pair (test + implementation) touches its own file; different pairs can run in parallel across developers, though within a pair the test precedes its implementation.
- Within US1: T017/T018 (tests) in parallel; T019–T023 mostly sequential (reconcile → sync command → init command, since `init` calls `sync`'s logic).
- Within US2: T025/T026 in parallel; `run.ts` (T027/T028) can be built in parallel with US1's later tasks by a different developer, since it shares no file with `init.ts`/`sync.ts`.
- Within US3: T029–T034 (tests) in parallel; T035–T038 (implementation) are mostly sequential, since T036 depends on T035's reconcile-plan shape and T038 depends on T020/T036 both existing.
- Polish: T039/T040 in parallel; T041/T042 sequential (run tests before/after manual validation as convenient, but both need the finished package).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (US1) — `init` + zero-touch `sync`.
3. **STOP and VALIDATE**: run `quickstart.md` Scenario 1 against a real dev instance.
4. This alone is a demoable MVP: a repo goes from unset-up to a working, self-maintaining skill roster.

### Incremental Delivery

1. Setup + Foundational → Phase 3 (US1) → validate → demo (MVP).
2. Phase 4 (US2) → validate Scenario 2 → demo (manual sync/run, live governance).
3. Phase 5 (US3) → validate Scenario 3 → demo (conflict/failure safety).
4. Phase 6 (Polish) → package ready to publish.
