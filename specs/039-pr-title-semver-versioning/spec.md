# Feature Specification: PR-Title-Driven Semantic Versioning

**Feature Branch**: `release/pr-title-semver-versioning`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "PR-title-driven semantic versioning for the release pipeline. Enforce Conventional Commits PR titles at merge time (fix: -> patch, feat: -> minor, a `!` or `BREAKING CHANGE:` footer -> major). On push to main, resolve the merged PR's title/body, compute the next semver version from the latest git tag, tag the commit and the published Docker image, update charts/skillcanon/Chart.yaml's version/appVersion (guarding for the fact that path doesn't exist on main yet), and document the convention in docs/context/ plus (optionally) the PR template."

**Descope note (2026-08-15, post-implementation)**: The original input above described full automatic versioning (auto git tag, auto versioned image tag, auto Chart.yaml bump-and-commit). After an initial implementation of that scope, the maintainer decided that's more automation than wanted right now and descoped it to an **informational-only** suggestion — see Clarifications below for the full rationale. This spec has been updated in place to reflect the descoped requirement, per this repo's convention against letting a spec go stale versus what actually ships.

## Clarifications

### Session 2026-08-15

- Q: The release pipeline needs to push a small bot commit (Chart.yaml version bump) directly to `main`. If `main` has branch protection that blocks direct pushes (even from GITHUB_TOKEN), how should the pipeline behave? → A: Push directly with GITHUB_TOKEN (same auth pattern as the repo's existing `docker-publish.yml`/`helm-publish.yml`); if the push is rejected, that step fails loudly rather than silently warning. The version tag and Docker image tag have already been published successfully by that point regardless of this step's outcome.
  **Superseded 2026-08-15** — this whole mechanism (git tag push, versioned image tag, Chart.yaml bump-and-commit) was descoped after implementation; see the next entry. This bullet is kept for decision history only and no longer describes what the pipeline does.
- Q (descope, direct maintainer decision, not a `/speckit-clarify` question): Full automatic versioning (auto-tag, auto-versioned-image-tag, auto-Chart.yaml-bump-and-push) turned out to be more automation than the maintainer wants right now. → A: Table all of it. Replace with a much smaller scope: on push to `main`, when a push resolves to a merged PR, compute what the version bump *would be* from that PR's title using the same classification logic (patch/minor/major), and surface it as a clearly visible, purely informational note (a GitHub Actions job summary). No git tag is created, no Docker image tag is published beyond the existing `:latest`/`:<sha>`, and no file anywhere is edited or committed as a result. The maintainer creates a real release (tag, versioned image, chart bump) by hand, on their own schedule, once ready — this feature's job ends at "here's what it would be," not "here it is."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Contributor gets immediate feedback on a malformed PR title (Priority: P1)

A contributor (including the maintainer) opens a pull request against `main`. The repository checks the PR title against the Conventional Commits format as soon as the PR is opened, and again if the title is edited or new commits are pushed. If the title doesn't match, the check fails visibly on the PR and the PR cannot be merged while it fails.

**Why this priority**: This is the enforcement mechanism the version-bump suggestion depends on — the pipeline can only trust a PR's title to compute a meaningful suggestion if that title was actually validated before merge. Without this, a badly-titled PR could merge and the release run would either silently default to a patch-level guess or the whole classification would be meaningless.

**Independent Test**: Open a PR titled `update readme` (no type prefix) against `main` and confirm a failing status check appears on the PR, blocking merge. Then retitle it `docs: update readme` and confirm the check turns green, with no other change needed.

**Acceptance Scenarios**:

1. **Given** a new PR is opened with title `add caching layer` (no Conventional Commits type), **When** the title check runs, **Then** the check fails and the PR shows a blocking status.
2. **Given** an open PR whose title already passed the check, **When** the contributor edits the title to remove the type prefix, **Then** the check re-runs and fails.
3. **Given** an open PR titled `feat: add caching layer`, **When** the title check runs, **Then** the check passes.

---

### User Story 2 - Merging a PR surfaces a next-version suggestion, informationally (Priority: P1)

Once a correctly-titled PR merges into `main`, the release pipeline determines the merged PR's title (and body, for a breaking-change footer), classifies whether that's a patch, minor, or major change per Conventional Commits rules, computes what the next version *would be* from the latest existing release tag, and surfaces that as a clearly visible, human-readable note on the pipeline run. It does not create a git tag, does not publish a versioned Docker image tag, and does not edit or commit any file — the maintainer reads the note and creates the actual release by hand, whenever they choose to.

**Why this priority**: This is the actual deliverable the maintainer asked for — removing the manual "what should the next version number be" calculation, without taking over the act of releasing itself.

**Independent Test**: With the latest tag at `v0.3.1`, merge a PR titled `fix: correct null pointer in expand()`. Confirm the release pipeline's run summary states a suggested next version of `v0.3.2` (patch), referencing the PR number and title, and explicitly states no tag was created. Confirm no new git tag and no new Docker image tag exist afterward beyond the always-published `:latest`/`:<sha>`.

**Acceptance Scenarios**:

1. **Given** the latest tag is `v0.3.1`, **When** a PR titled `fix: ...` merges, **Then** the pipeline's run summary states the suggested next version is `v0.3.2` (patch) and that no tag was created automatically.
2. **Given** the latest tag is `v0.3.1`, **When** a PR titled `feat: ...` merges, **Then** the summary states the suggested next version is `v0.4.0` (minor, patch reset).
3. **Given** the latest tag is `v0.3.1`, **When** a PR titled `feat!: ...` merges, **Then** the summary states the suggested next version is `v1.0.0` (major, minor+patch reset).
4. **Given** the latest tag is `v0.3.1`, **When** a PR titled `fix: ...` merges whose body contains a `BREAKING CHANGE:` footer, **Then** the summary states the suggested next version is `v1.0.0` (major), not `v0.3.2`.
5. **Given** no release tag exists yet in the repository, **When** a qualifying PR merges, **Then** the summary treats the prior version as `v0.0.0` and suggests the bump from there.
6. **Given** the merged commit reaching `main` is a direct push with no associated pull request, **When** the release pipeline runs, **Then** it publishes the existing `:latest`/`:<sha>` image tags as before and produces no version suggestion, without failing the pipeline.
7. **Given** a PR merges and the pipeline produces a version suggestion, **When** an operator inspects the repository immediately afterward, **Then** no new git tag exists, no new Docker image tag beyond `:latest`/`:<sha>` exists, and no file in the repository was changed by the pipeline.

---

### User Story 3 - The title convention is discoverable, and documented to match what the pipeline actually does (Priority: P2)

Anyone opening a new PR (or reading repo docs) can find a clear, example-driven explanation of the title convention and what the pipeline actually does with it — that it suggests a version, it does not release one — without having to reverse-engineer it from the workflow YAML.

**Why this priority**: Valuable and reduces confusion about what's automated versus manual, but the pipeline's core suggestion mechanism is still useful without it.

**Independent Test**: Open `docs/context/release-versioning.md` and confirm it documents the title format, the three bump types, worked examples, and explicitly states that the pipeline only suggests a version and the maintainer creates the release by hand. Open `.github/pull_request_template.md` and confirm a short title-convention reminder is visible before typing a title.

**Acceptance Scenarios**:

1. **Given** a new contributor is about to open a PR, **When** they view the PR creation form, **Then** they see a short reminder of the required title format before they type a title.
2. **Given** someone reads `docs/context/release-versioning.md`, **When** they look for what happens after merge, **Then** the doc clearly states the pipeline only surfaces a suggested next version and does not create a tag, publish a versioned image, or edit any file.

### Edge Cases

- A PR title passes the Conventional Commits type/format check but uses a type the release pipeline doesn't specifically recognize as `feat` (e.g. `perf:`, `refactor:`, `chore:`) — treated as patch-level, same as `fix:`, per the maintainer's "fix: or otherwise-patch-level" instruction.
- A PR's title is well-formed but an admin merges it despite a failing/skipped title check (e.g. branch protection bypass) — the release pipeline's own bump-detection still runs a defensive parse and falls back to a patch-level suggestion rather than failing the whole run outright.
- A commit lands on `main` from something other than a merged PR from this repository's standard flow (e.g. a squash-merge in the future, or a repo-admin's direct push) — no version suggestion is produced; base image publishing (`:latest`/`:<sha>`) is unaffected, and the run does not fail.
- Two PRs merge in quick succession — each run independently reads the latest tag at the time it runs; since no tag is ever created by this pipeline, there is no ordering/race concern between runs to design around (this was a real concern under the original auto-tagging design and is now moot).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST validate every pull request's title against the Conventional Commits format (`type(optional-scope)!: subject`, using the type set feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert) whenever a PR is opened, edited, or newly synchronized.
- **FR-002**: The system MUST present a failing, blocking status on any PR whose title does not conform, and a passing status once it does.
- **FR-003**: On every push to `main`, the system MUST determine whether that push corresponds to a merged pull request from this repository, using a method verified to actually work against this repository's real merge history (not assumed from convention).
- **FR-004**: When a push corresponds to a merged PR, the system MUST classify the bump as **major** if the PR title contains a Conventional Commits breaking-change marker (`!` before the colon) or the PR body contains a `BREAKING CHANGE:` (or `BREAKING-CHANGE:`) footer; **minor** if the title's type is `feat` (and it is not already major); otherwise **patch**.
- **FR-005**: The system MUST compute what the next version *would be* by reading the latest existing semver git tag in the repository (treating the absence of any tag as `v0.0.0`) and applying the classified bump (major resets minor and patch to 0; minor resets patch to 0; patch increments only the patch number). This computed value is used only to construct the informational note in FR-007 — it MUST NOT be persisted as a git tag, a Docker image tag, or any other repository state.
- **FR-006**: The system MUST publish `:latest` and `:<sha>` Docker image tags on every push to `main`, independent of whether a merged PR is resolvable or a bump classified — matching the behavior already in place before this feature.
- **FR-007**: When a push corresponds to a merged PR, the system MUST surface a clearly visible, purely informational message stating the suggested next version, the classified bump type, and the source PR's number/title, and stating explicitly that no tag or release was created automatically. The system MUST NOT create any git tag, MUST NOT publish any Docker image tag beyond the `:latest`/`:<sha>` tags from FR-006, and MUST NOT edit or commit any file in the repository as a result of this classification.
- **FR-008**: When a push to `main` does not correspond to a resolvable merged PR, the system MUST still publish the `:latest`/`:<sha>` image tags (FR-006) and MUST NOT produce a version suggestion or fail the pipeline solely for lacking a PR to classify.
- **FR-009**: The repository MUST include reference documentation, in the style of the existing `docs/context/*.md` files, explaining the PR title convention, which prefix/marker produces which suggested bump, worked examples, and that the pipeline only suggests a version rather than releasing one.
- **FR-010**: A contributor creating a new PR MUST be shown a reminder of the required title convention at PR-creation time (not only discoverable by reading separate documentation).

### Key Entities

- **Pull Request title**: The Conventional-Commits-formatted string (`type(scope)!: subject`) a contributor supplies when opening a PR; the sole trusted input the release pipeline classifies a suggested version bump from.
- **Pull Request body / BREAKING CHANGE footer**: Free-text PR description that may contain a `BREAKING CHANGE:` marker, the secondary input used only to detect a major bump when the title itself doesn't carry the `!` marker.
- **Suggested release version**: A semver value (`vMAJOR.MINOR.PATCH`) derived from the previous latest tag plus one classified bump; realized *only* as text in the pipeline run's informational note — it has no other representation anywhere in the repository or registry unless and until the maintainer manually creates the corresponding tag/release themselves.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of PRs merged into `main` after this feature ships have titles that were checked against the Conventional Commits format before merge (verifiable via the required status check's history on each merged PR).
- **SC-002**: Every push to `main` that corresponds to a merged, correctly-titled PR produces a visible, correctly-classified version suggestion in the pipeline run, with zero automated changes to repository or registry state beyond the always-published `:latest`/`:<sha>` image tags.
- **SC-003**: A push to `main` with no resolvable merged PR (e.g. a direct admin push) never fails the pipeline and always still publishes the `:latest`/`:<sha>` image tags, matching current behavior.
- **SC-004**: A contributor can determine the correct PR title format without leaving the PR-creation screen, and can find full documentation with worked examples — including what the pipeline does and does not automate — within one navigation step from the repo root (`docs/context/release-versioning.md`).

## Assumptions

- This repository merges pull requests as real merge commits (not squash merges) — confirmed by inspecting recent merge commit history on `main` — but the merge commit message body does **not** itself contain the originating PR's title, so bump-detection cannot rely on parsing `git log`/commit message text and must resolve the PR via the GitHub API instead.
- No `.github/pull_request_template.md` exists yet in this repository; adding one (containing the title-convention reminder) is in scope as the most direct way to satisfy "visible at PR-creation time."
- Types other than `feat` that still pass the Conventional Commits format check (`fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`) all suggest a patch bump — this matches the maintainer's "fix:-prefixed or otherwise-patch-level" phrasing rather than a stricter release-notes-oriented scheme where some types (e.g. `docs`, `chore`) would not trigger a release at all.
- Direct/admin pushes to `main` that bypass the PR flow are an accepted, ungated edge case (no PR title exists to classify from) — no suggestion is produced for them, and this is treated as correct behavior rather than a gap to close.
- Package versioning in `package.json` (currently a static `0.1.0`, unrelated to this scheme per existing project convention) is out of scope.
- `charts/skillcanon/Chart.yaml` and its `version`/`appVersion` fields are **entirely out of scope** for this feature as descoped — not deferred, not guarded-for-later, simply untouched by any workflow this feature adds. Keeping the chart's version in sync with a release (once that chart exists on `main` — it doesn't today) is left as a fully manual step for whoever creates the release, same as the git tag and versioned image itself.
- The workflow(s) that publish the Docker image today (currently `.github/workflows/docker-publish.yml`) may be restructured (e.g. consolidated into a new release workflow) as needed to avoid two independent jobs both building/pushing the same image tags on every push to `main`; the requirement is that the resulting `:latest`/`:<sha>` tags are still published, not that any particular existing workflow file must survive unchanged.
