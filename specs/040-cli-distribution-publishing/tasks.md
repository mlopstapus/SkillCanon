# Tasks: CLI Distribution & Publishing

**Input**: Design documents from `/specs/040-cli-distribution-publishing/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli-interface.md, quickstart.md

**Tests**: included — Constitution Principle I (Test-First Development) applies to all new logic in this feature; every new/modified `src` module gets a corresponding test written first, following `cli/test/**`'s existing conventions.

**Organization**: grouped by user story (spec.md priorities P1/P2/P3) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps task to US1/US2/US3 from spec.md
- All paths are relative to the repository root

---

## Phase 1: Setup

- [X] T001 Establish a clean baseline: run `pnpm --dir cli install && pnpm --dir cli run typecheck && pnpm --dir cli test && pnpm --dir cli run build` and confirm all pass before making any changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: both user stories US1 and US2 depend on `cli/package.json`'s new fields; US1 and US3 both depend on `getInstalledVersion()`. Complete this phase before starting any user story.

- [X] T002 [P] Update `cli/package.json`: remove `"private": true`; add `"name": "@mlopstapus/skillcanon"`, `"license": "Apache-2.0"`, `"repository": { "type": "git", "url": "https://github.com/mlopstapus/SkillCanon.git", "directory": "cli" }`, `"homepage"`, `"publishConfig": { "registry": "https://npm.pkg.github.com", "access": "restricted" }`, `"files": ["dist"]` — per research.md D1/D5. Keep `"bin": { "skillcanon": "dist/index.js" }` unchanged.
- [X] T003 [P] Write failing test `cli/test/version.test.ts` for `getInstalledVersion()`: reads `cli/package.json`'s `version` field at runtime and returns it as a string (research.md D6).
- [X] T004 Implement `cli/src/version.ts`'s `getInstalledVersion(): string` (reads via `readFileSync` relative to `fileURLToPath(import.meta.url)`, not a compile-time JSON import — see D6 for why) to make T003 pass.

**Checkpoint**: Foundational work complete — user story phases below can begin.

---

## Phase 3: User Story 1 - Install the CLI with a standard package manager command (Priority: P1) 🎯 MVP

**Goal**: the package is installable via `npm install -g @mlopstapus/skillcanon` from GitHub Packages and reports its own version via `--version`.

**Independent Test**: on a machine that has never cloned this repository, follow `contracts/cli-interface.md`'s documented install steps, then run `skillcanon --version` and confirm it prints a version matching the most recently published release (requires US2 to have actually published something at least once — see spec.md's own framing of US2 as what makes US1 stay true release after release).

### Implementation for User Story 1

- [X] T005 [US1] In `cli/src/index.ts`, wire `program.version(getInstalledVersion())` (imports from `./version.js`) — implements the `skillcanon --version`/`-V` flag per `contracts/cli-interface.md`. Depends on T004.
- [X] T006 [US1] Rewrite `cli/README.md`'s "Install" section to the GitHub Packages registry-config + `npm install -g @mlopstapus/skillcanon` steps documented in `contracts/cli-interface.md`'s "Install" section, replacing the current "build it locally" instructions (FR-002).

**Checkpoint**: User Story 1's code changes are complete. The independent test itself only fully passes once User Story 2 has produced at least one published version (documented dependency, not a code dependency).

---

## Phase 4: User Story 2 - Every merged CLI change is published without manual intervention (Priority: P2)

**Goal**: merging a version-bumped `cli/**` change to `main` automatically publishes the new version to GitHub Packages, with no separate manual publish step, and cleanly skips (not fails) when the version wasn't bumped.

**Independent Test**: merge a version-bumped `cli/` change to `main`; confirm, with no further human action, that the new version becomes installable within one CI run. Merge a non-version-bumped `cli/` change; confirm the workflow run is green with a visible "already published, skipped" notice rather than a failure. See `quickstart.md` Scenario 1.

### Implementation for User Story 2

- [X] T007 [US2] Create `.github/workflows/cli-publish.yml` per research.md D2: triggers on `push` to `main` with `paths: ["cli/**"]`; `working-directory: cli`; steps = checkout → `pnpm/action-setup@v4` → `actions/setup-node@v4` (`node-version-file: cli/package.json`, `registry-url: https://npm.pkg.github.com`, `scope: '@mlopstapus'`) → `pnpm install --frozen-lockfile` → `pnpm run typecheck` → `pnpm test` → `pnpm run build` → version-change check (`npm view "@mlopstapus/skillcanon@$LOCAL_VERSION" version`; already-published → `::notice::` + exit 0, per FR-004) → `npm publish` with `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` and no suppressed exit code (FR-005's protection is npm's own immutable-version rejection); `permissions: { contents: read, packages: write }` (FR-007). Depends on T002 (the `name`/`publishConfig`/`files` fields this workflow relies on).

**Checkpoint**: User Stories 1 and 2 together mean a version-bumped merge to `main` results in an installable, `--version`-reporting package.

---

## Phase 5: User Story 3 - The CLI tells me when a newer version is available (Priority: P3)

**Goal**: every CLI invocation (subject to a 24h cache and a 2s network budget) checks the registry for a newer version and prints a non-blocking, stderr-only upgrade notice — never altering the command's own output or exit code, and fully disableable via an environment variable.

**Independent Test**: install an older published version, publish a newer one (US2), run any command and confirm the upgrade notice appears on stderr with the exact upgrade command; confirm no re-check happens on a second invocation shortly after; confirm no notice and no error when offline; confirm `SKILLCANON_DISABLE_UPDATE_CHECK=1` fully suppresses the check. See `quickstart.md` Scenario 3.

### Tests for User Story 3 ⚠️

> Write these tests FIRST, ensure they FAIL before implementation

- [X] T008 [P] [US3] Write failing tests in `cli/test/redact.test.ts` for the GitHub token prefixes (`ghp_`, `github_pat_`, `gho_`, `ghu_`, `ghs_`, `ghr_`) getting redacted the same way `sk_...` already is (research.md D8).
- [X] T009 [P] [US3] Write failing tests in `cli/test/config/npm-auth.test.ts` for reading a GitHub Packages auth token from a fixture `.npmrc` (home-dir vs. cwd precedence; missing file or missing `//npm.pkg.github.com/:_authToken=` line → returns `null`, never throws) (research.md D3).
- [X] T010 [P] [US3] Write failing tests in `cli/test/update-check.test.ts` — using a real `node:http` test server per `skillcanon-client.test.ts`'s established pattern — covering: cache-hit within 24h skips the network call entirely; cache-miss triggers a fetch and writes the cache on success; `isNewerVersion` comparison (older/equal/newer); a slow/hanging server triggers the 2s timeout and the check degrades silently (FR-013); no token found (npm-auth.ts's reader returns `null`) → network fetch never attempted, `lastCheckedAt` still written, no notice (FR-013 edge case, research.md D3/D4); `SKILLCANON_DISABLE_UPDATE_CHECK` set → zero cache reads/writes and zero network calls (FR-014); cache's `lastCheckedAt` is written even on a failed attempt (research.md D4); the formatted notice matches `contracts/cli-interface.md`'s exact wording and always shows the canonical `npm install -g @mlopstapus/skillcanon@latest` command; when a notice is shown, the command's own exit code and stdout are asserted unchanged (FR-011).

### Implementation for User Story 3

- [X] T011 [P] [US3] Implement the GitHub-token redaction cases in `cli/src/redact.ts` to make T008 pass (research.md D8).
- [X] T012 [P] [US3] Implement `cli/src/config/npm-auth.ts`'s token-from-`.npmrc` reader to make T009 pass (research.md D3). Independent of T011 — different files, no shared dependency.
- [X] T013 [US3] Implement `cli/src/update-check.ts` to make T010 pass: cache read/write at `~/.skillcanon/update-check.json`, 2-second-timeout fetch to `https://npm.pkg.github.com/@mlopstapus/skillcanon` authenticated via `npm-auth.ts`'s token, `isNewerVersion()` plain semver comparison (research.md D7 — no new dependency), notice-string formatting per `contracts/cli-interface.md`, and the `SKILLCANON_DISABLE_UPDATE_CHECK` early-exit. Depends on T012.
- [X] T014 [US3] Wire the update check into `cli/src/index.ts`: start the check (as a promise, not awaited) in parallel with `program.parseAsync(...)`; after the command completes, await the check (bounded by its own internal timeout) and print any notice to stderr (research.md D4). Depends on T005 (same file) and T013.

**Checkpoint**: all three user stories complete and independently verifiable per `quickstart.md`.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T015 [P] Run `pnpm --dir cli run typecheck && pnpm --dir cli test && pnpm --dir cli run build` clean, covering every task above.
- [X] T016 [P] Re-read `cli/README.md` end-to-end for consistency; confirm the Install section matches `contracts/cli-interface.md` exactly. (The pre-existing `run --input '<json>'` documentation staleness noted in research.md is explicitly out of scope — do not touch it.)
- [ ] T017 Run `quickstart.md` Scenarios 1–4 after the feature branch has actually merged to `main` and `cli-publish.yml` has run at least once (this is necessarily post-merge — the registry has nothing published before then). Record any gap found as a follow-up, per this repo's established pattern for post-merge validation findings.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. Blocks all user stories (T002 blocks US1/US2; T003/T004 block US1/US3).
- **User Story 1 (Phase 3)**: depends on Foundational (T004). Independent of US2/US3's code, though its *end-to-end* independent test needs US2 to have published something once.
- **User Story 2 (Phase 4)**: depends on Foundational (T002). Independent of US1/US3.
- **User Story 3 (Phase 5)**: depends on Foundational (T004) and, for T014, on US1's T005 (both touch `index.ts`).
- **Polish (Phase 6)**: depends on all three user stories.

### Parallel Opportunities

- T002 and T003 (Phase 2) — different files.
- T008, T009, T010 (Phase 5 tests) — three different files, no shared dependency.
- T015 and T016 (Phase 6) — independent checks.
- US2 (Phase 4, entirely T007) can be built in parallel with US1 (Phase 3) once Foundational is done — they touch disjoint files (`cli-publish.yml` vs. `index.ts`/`README.md`).

---

## Parallel Example: Phase 5 (User Story 3) tests

```bash
Task: "Write failing tests in cli/test/redact.test.ts for GitHub token prefixes"
Task: "Write failing tests in cli/test/config/npm-auth.test.ts for .npmrc token reading"
Task: "Write failing tests in cli/test/update-check.test.ts for cache/timeout/disable behavior"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1).
2. **STOP and VALIDATE**: US1's code is correct, but its full independent test can't pass until US2 exists (nothing is published yet). This is expected and documented above — it's not a signal to skip ahead without validating what *can* be validated locally (package.json shape, `--version` output against a local build).

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → package is installable-shaped and reports its version (once something is published).
3. US2 → the missing piece that actually publishes — US1's promise becomes real.
4. US3 → adds the update-notice layer on top of a now-real publish/install loop.
5. Polish → full-suite verification + post-merge quickstart validation.

---

## Notes

- [P] tasks touch different files with no dependency on an incomplete task.
- Tests are written first within each phase that has them (T003 before T004; T008–T010 before T011–T014), per Constitution Principle I.
- No task in this feature touches `src/bcs/**`, the database, or any web UI surface — everything is scoped to `cli/` and one new root-level GitHub Actions workflow.
