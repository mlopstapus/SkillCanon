# Tasks: PR-Title-Driven Semantic Versioning

**Input**: Design documents from `/specs/039-pr-title-semver-versioning/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/release-pipeline.md, quickstart.md (all present)

**Tests**: Not applicable — no test framework exists for GitHub Actions workflow YAML in this repo (plan.md Technical Context > Testing). Verification tasks use `actionlint` and the manual traces defined in `quickstart.md` instead of automated tests.

**Organization**: Tasks are grouped by user story (spec.md priorities). No Foundational phase is needed — the three stories touch entirely disjoint files (two workflow files, one docs page, one PR template) with no shared scaffolding to build first.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 = PR title lint, US2 = release/version workflow, US3 = chart-sync/docs discoverability

## Path Conventions

CI/CD configuration and docs only — no `src/` involved. Paths are repo-root-relative: `.github/workflows/`, `.github/`, `docs/context/`.

---

## Phase 1: Setup

- [X] T001 Confirm `actionlint` is available locally (`actionlint --version`); this is the sole verification tool for every workflow-file task below (quickstart.md Prerequisites).

**Checkpoint**: Tooling confirmed — proceed to user stories in any order (no shared blocking work).

---

## Phase 2: User Story 1 - Contributor gets immediate feedback on a malformed PR title (Priority: P1) 🎯 MVP

**Goal**: A required GitHub status check that fails a PR whose title doesn't match Conventional Commits format, and passes once corrected.

**Independent Test**: Per contracts/release-pipeline.md's title table — `docs: update readme` passes, `update readme` fails, `feat!: drop legacy config format` passes (breaking marker accepted).

- [X] T002 [US1] Create `.github/workflows/pr-title-lint.yml`: trigger on `pull_request` types `opened`/`edited`/`synchronize` targeting `main`; `permissions: pull-requests: read, statuses: write`; single job running `amannn/action-semantic-pull-request@v5` with `types` = feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert, `requireScope: false`, and a `subjectPattern` rejecting an empty or period-ending subject (per data-model.md's `PullRequestTitle` rules and contracts/release-pipeline.md's regex).
- [X] T003 [US1] Run `actionlint .github/workflows/pr-title-lint.yml` and fix any findings until clean (quickstart.md Step 1).
- [X] T004 [US1] Manually trace the title table in quickstart.md Step 2 (six example titles) against the `types`/`subjectPattern` configured in T002 and confirm each expected pass/fail outcome by inspection.

**Checkpoint**: US1 is independently complete — a PR title check exists and its behavior is verified by trace, without needing US2 or US3.

---

## Phase 3: User Story 2 - Merging a PR automatically produces the correct next version (Priority: P1)

**Goal**: On push to `main`, resolve the merged PR, classify the bump, compute and publish the next version as a git tag and Docker image tag, alongside the existing `:latest`/`:<sha>` tags — without breaking when no PR is resolvable.

**Independent Test**: Per quickstart.md Steps 3–4 — trace bump classification against real merge-commit data (confirms PR-title parsing must go through the GitHub API, not commit messages) and confirm the "no tag yet → v0.0.0" path is the one this repo's first release will actually take.

- [X] T005 [US2] Delete `.github/workflows/docker-publish.yml` (research.md Decision 5 — its always-run `:sha`/`:latest` publish is folded into `release.yml` in T006 to avoid two workflows racing to `docker build .`/push the same tags on every push to `main`).
- [X] T006 [US2] Create `.github/workflows/release.yml` with `on: push: branches: [main]`, `permissions: contents: write, packages: write, pull-requests: read`, `concurrency: group: release-main, cancel-in-progress: false`, and a single job with: checkout (`fetch-depth: 0`), GHCR login, `docker build` tagging `:<sha>` and `:latest`, and pushing both — unconditionally, matching `docker-publish.yml`'s prior behavior exactly (contracts/release-pipeline.md "Always produces").
- [X] T007 [US2] Add a "resolve merged PR and bump type" step to `release.yml`: call `gh api repos/{repo}/commits/{sha}/pulls`, filter to `merged_at != null`, prefer the entry whose `merge_commit_sha == github.sha`; on zero results, emit `::notice::` and set `found=false` (job continues, exit 0 — FR-009); on a match, fetch title/body via `gh pr view`, parse the title against the Conventional Commits regex **stored in a shell variable** (not inlined in the `[[ ]]` test — research.md Decision 6, avoids shellcheck SC1072/SC1073), check the body for a `^BREAKING[ -]CHANGE:` line, and classify `bump` as major/minor/patch per data-model.md's `BumpType` rules (default to `patch` with a `::warning::` if the title fails to parse at all).
- [X] T008 [US2] Add a "compute next version" step (`if: steps.pr.outputs.found == 'true'`): `git fetch --tags --force`, read the latest `v*` tag by semver sort defaulting to `v0.0.0` when none exists, apply the classified bump per data-model.md's `ReleaseVersion` arithmetic (major resets minor+patch, minor resets patch), and output both the `vX.Y.Z` tag and its bare `X.Y.Z` form.
- [X] T009 [US2] Add "create and push git tag" and "tag and push version image" steps (both `if: steps.pr.outputs.found == 'true'`): configure `github-actions[bot]` git identity, create an annotated tag referencing the PR number/title, push it; then `docker tag`/`docker push` the version tag from the **already-built local image** from T006 (no re-pull — contracts/release-pipeline.md, research.md Decision 5).
- [X] T010 [US2] Add "bump Helm chart version" step (`if: steps.pr.outputs.found == 'true'`): guard on `[ -f charts/skillcanon/Chart.yaml ]`, emitting `::notice::` and skipping (not failing) when absent — true on `main` today (FR-008, Edge Cases); when present, `sed`-replace its `version:`/`appVersion:` lines with the bare version.
- [X] T011 [US2] Add "commit Chart.yaml version bump" step (`if: steps.pr.outputs.found == 'true' && steps.chart.outputs.updated == 'true'`): commit as `github-actions[bot]` with message `chore(release): bump chart version to X.Y.Z [skip ci]`, `git push origin HEAD:main` using the ambient `GITHUB_TOKEN` (research.md Decision 8); a rejected push MUST fail this step visibly per the Clarifications decision, without affecting the already-completed tag/image steps from T009.
- [X] T012 [US2] Run `actionlint .github/workflows/release.yml` and fix any findings (including the Decision 6 shellcheck pattern) until clean.
- [X] T013 [US2] Manually run quickstart.md Steps 3–5 (merge-commit trace, tag-state trace, chart-file-absence trace) and confirm each documented "expected today" outcome matches this repo's actual current state.

**Checkpoint**: US2 is independently complete — `release.yml` publishes `:sha`/`:latest` unconditionally and version tags/chart bumps conditionally, verified by trace against real repo state, without needing US1 to exist (US2's defensive parse fallback means it degrades gracefully even if title-lint were absent).

---

## Phase 4: User Story 3 - Helm chart and docs stay in lockstep with the released version (Priority: P2)

**Goal**: The title convention is discoverable at PR-creation time and fully documented with worked examples in the repo's existing documentation style.

**Independent Test**: Open `docs/context/release-versioning.md` and confirm it documents the title format, all three bump types, and worked examples in this repo's existing tone; open `.github/pull_request_template.md` and confirm the reminder line is present.

- [X] T014 [P] [US3] Write `docs/context/release-versioning.md`, reading `docs/context/api-conventions.md`, `docs/context/testing-strategy.md`, and `docs/context/repo-structure.md` first to match tone/structure (Status/Decided header, plain prose, worked examples). Cover: the PR title format, the exact type→bump mapping (feat→minor, all other passing types→patch, `!`/`BREAKING CHANGE:`→major), the `v0.0.0` no-tag-yet default, the `:latest`/`:<sha>`/`:vX.Y.Z` Docker tag scheme, and the Chart.yaml sync behavior (including that it's currently a no-op since the file doesn't exist on `main` yet).
- [X] T015 [P] [US3] Create `.github/pull_request_template.md` with a short reminder line pointing at the Conventional Commits title requirement and linking to `docs/context/release-versioning.md` for the full convention.

**Checkpoint**: US3 is independently complete — both files exist and are readable/correct in isolation, with no dependency on US1/US2's actual file contents (only on the already-finalized convention from spec.md/research.md).

---

## Phase 5: Polish & Cross-Cutting

**Purpose**: Final consistency checks across all three stories together.

- [X] T016 Run `actionlint .github/workflows/*.yml` (all files, including the untouched `ci.yml`/`helm-publish.yml`) to confirm no regression was introduced repo-wide.
- [X] T017 Complete the quickstart.md "Manual review checklist" (Step 6): confirm the version-tag `docker tag`/`docker push` in T009 doesn't re-pull; confirm every `steps.pr.outputs.found`-gated step in `release.yml` is correctly gated; confirm `permissions:` blocks in both new workflow files exactly match contracts/release-pipeline.md's table; confirm `pr-title-lint.yml`'s `types` list (T002) and `release.yml`'s bump-classification type set (T007) list the same ten types.
- [X] T018 Commit all changes on `release/pr-title-semver-versioning` (local commit only — per task constraints, do not push, do not open a PR).

---

## Dependencies & Execution Order

- **Setup (T001)**: No dependencies — do first.
- **User Story 1 (T002–T004)**: Depends only on T001. Independent of US2/US3.
- **User Story 2 (T005–T013)**: Depends only on T001. Independent of US1/US3 (T006's `release.yml` is written and validated standalone; US1's check existing or not doesn't change US2's own defensive-parse behavior). Within US2: T005 before T006 (avoid a moment where both files coexist and could race); T006 before T007–T011 (later steps append to the same file); T007 before T008 (version calc needs the classified bump); T008 before T009; T009 before T010/T011 only in the sense they're later steps in the same file, no data dependency; T012 after T005–T011 (lint the finished file); T013 after T012.
- **User Story 3 (T014–T015)**: Depends only on T001. Fully independent of US1/US2 — can be done in parallel with either.
- **Polish (T016–T018)**: Depends on all of T002–T015 being complete.

## Parallel Execution Examples

Since each story touches disjoint files, all three stories' *first* tasks can start together once T001 is done:

```text
T002 [US1] .github/workflows/pr-title-lint.yml
T006 [US2] .github/workflows/release.yml (after T005)
T014 [P] [US3] docs/context/release-versioning.md
T015 [P] [US3] .github/pull_request_template.md
```

T014 and T015 are marked `[P]` against each other (genuinely different files, no ordering need). T002 and T006 are not marked `[P]` against each other only because a single implementer working through this list sequentially will naturally do one file at a time — there is no actual file-level conflict between them either.

## Implementation Strategy

**MVP = User Story 1 alone** (T001–T004): the title-lint check is the smallest independently valuable increment — it starts protecting PR quality immediately, before the release workflow exists to consume it.

**Incremental delivery**: US1 → US2 → US3, matching spec.md's priority order (P1, P1, P2), though US2 and US3 have no dependency on each other or on US1 and could be done in either order or in parallel by different people.

---

## Descope Addendum (2026-08-15, post-implementation)

After T001–T018 above shipped full automatic versioning (git tag + versioned image tag + Chart.yaml bump-and-commit), the maintainer descoped that to an informational-only suggestion (spec.md Clarifications). The tasks below replaced the now-removed T009/T010/T011 automation with a single informational step, updated every design doc to match, and re-validated.

- [X] T019 [US2] Remove the "create and push git tag," "tag and push version image," "bump Helm chart version," and "commit Chart.yaml version bump" steps from `release.yml` (former T009–T011); replace with a single "post version suggestion" step that writes to `$GITHUB_STEP_SUMMARY` (and a matching `::notice::`) stating the classified bump, suggested next version, and source PR — with no git/docker/file side effects. Narrow `release.yml`'s `permissions:` block accordingly (drop `contents: write`, keep `contents: read` for checkout).
- [X] T020 [US3] Update `docs/context/release-versioning.md` to describe the pipeline as suggesting a version rather than releasing one.
- [X] T021 Update `specs/039-pr-title-semver-versioning/{spec,plan,research,data-model,quickstart}.md` and `contracts/release-pipeline.md` to reflect the descope (mark superseded decisions rather than deleting them, per this repo's convention of preserving decision history).
- [X] T022 Re-run `actionlint` on the simplified `release.yml` and re-trace quickstart.md's steps against current repo state; fix any findings.
- [X] T023 Commit the descope on `release/pr-title-semver-versioning`.
