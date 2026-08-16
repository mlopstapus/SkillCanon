# Feature Specification: PR-Title-Driven Semantic Versioning

**Feature Branch**: `release/pr-title-semver-versioning`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "PR-title-driven semantic versioning for the release pipeline. Enforce Conventional Commits PR titles at merge time (fix: -> patch, feat: -> minor, a `!` or `BREAKING CHANGE:` footer -> major). On push to main, resolve the merged PR's title/body, compute the next semver version from the latest git tag, tag the commit and the published Docker image, update charts/skillcanon/Chart.yaml's version/appVersion (guarding for the fact that path doesn't exist on main yet), and document the convention in docs/context/ plus (optionally) the PR template."

## Clarifications

### Session 2026-08-15

- Q: The release pipeline needs to push a small bot commit (Chart.yaml version bump) directly to `main`. If `main` has branch protection that blocks direct pushes (even from GITHUB_TOKEN), how should the pipeline behave? → A: Push directly with GITHUB_TOKEN (same auth pattern as the repo's existing `docker-publish.yml`/`helm-publish.yml`); if the push is rejected, that step fails loudly rather than silently warning. The version tag and Docker image tag have already been published successfully by that point regardless of this step's outcome.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Contributor gets immediate feedback on a malformed PR title (Priority: P1)

A contributor (including the maintainer) opens a pull request against `main`. The repository checks the PR title against the Conventional Commits format as soon as the PR is opened, and again if the title is edited or new commits are pushed. If the title doesn't match, the check fails visibly on the PR and the PR cannot be merged while it fails.

**Why this priority**: This is the enforcement mechanism everything else depends on — the release pipeline only produces a correct version bump if it can trust that every merged PR's title was actually validated before merge. Without this, a badly-titled PR could merge and either silently default to the wrong bump or break the release job outright.

**Independent Test**: Open a PR titled `update readme` (no type prefix) against `main` and confirm a failing status check appears on the PR, blocking merge. Then retitle it `docs: update readme` and confirm the check turns green, with no other change needed.

**Acceptance Scenarios**:

1. **Given** a new PR is opened with title `add caching layer` (no Conventional Commits type), **When** the title check runs, **Then** the check fails and the PR shows a blocking status.
2. **Given** an open PR whose title already passed the check, **When** the contributor edits the title to remove the type prefix, **Then** the check re-runs and fails.
3. **Given** an open PR titled `feat: add caching layer`, **When** the title check runs, **Then** the check passes.

---

### User Story 2 - Merging a PR automatically produces the correct next version (Priority: P1)

Once a correctly-titled PR merges into `main`, the release pipeline determines the merged PR's title (and body, for a breaking-change footer), decides whether that's a patch, minor, or major change per Conventional Commits rules, computes the next version from the latest existing release tag, and publishes that version as both a git tag and a Docker image tag — without a human doing any manual version bookkeeping.

**Why this priority**: This is the actual deliverable the maintainer asked for — the whole point of enforcing PR titles is so this step can trust them and run unattended.

**Independent Test**: With the latest tag at `v0.3.1`, merge a PR titled `fix: correct null pointer in expand()`. Confirm a new tag `v0.3.2` is created and pushed, and the Docker image is published as `ghcr.io/mlopstapus/skillcanon:v0.3.2` in addition to its existing `:latest`/`:<sha>` tags.

**Acceptance Scenarios**:

1. **Given** the latest tag is `v0.3.1`, **When** a PR titled `fix: ...` merges, **Then** the next tag created is `v0.3.2` (patch bump).
2. **Given** the latest tag is `v0.3.1`, **When** a PR titled `feat: ...` merges, **Then** the next tag created is `v0.4.0` (minor bump, patch reset).
3. **Given** the latest tag is `v0.3.1`, **When** a PR titled `feat!: ...` merges, **Then** the next tag created is `v1.0.0` (major bump, minor+patch reset).
4. **Given** the latest tag is `v0.3.1`, **When** a PR titled `fix: ...` merges whose body contains a `BREAKING CHANGE:` footer, **Then** the next tag created is `v1.0.0` (major bump), not `v0.3.2`.
5. **Given** no release tag exists yet in the repository, **When** the first qualifying PR merges, **Then** the pipeline treats the prior version as `v0.0.0` and bumps from there.
6. **Given** the merged commit reaching `main` is a direct push with no associated pull request, **When** the release pipeline runs, **Then** it publishes the existing `:latest`/`:<sha>` image tags as before and skips version tagging/tag creation without failing the pipeline.

---

### User Story 3 - Helm chart and docs stay in lockstep with the released version (Priority: P2)

When a new version is released, the Helm chart's own `version`/`appVersion` fields are updated to match and committed back to `main` automatically, so the chart never silently drifts out of sync with what's actually been tagged and published. Separately, anyone opening a new PR (or reading repo docs) can find a clear, example-driven explanation of the title convention without having to reverse-engineer it from the workflow YAML.

**Why this priority**: Valuable and reduces manual toil/drift, but the pipeline is still useful without it — the chart path doesn't even exist on `main` yet, and docs are supporting material rather than a release-blocking mechanism.

**Independent Test**: Once `charts/skillcanon/Chart.yaml` exists on `main`, merge a qualifying PR and confirm a follow-up commit updates its `version`/`appVersion` fields to the newly released version. Separately, open `docs/context/release-versioning.md` and confirm it documents the title format, the three bump types, and worked examples in the repo's existing documentation tone.

**Acceptance Scenarios**:

1. **Given** `charts/skillcanon/Chart.yaml` exists on `main` with `version: 1.2.3`, **When** a PR merges that triggers a bump to `v1.3.0`, **Then** a new commit on `main` updates the chart's `version` and `appVersion` fields to `1.3.0`.
2. **Given** `charts/skillcanon/Chart.yaml` does not exist on `main` (current state), **When** the release pipeline runs, **Then** it completes successfully without attempting to edit a nonexistent file and without failing the run.
3. **Given** a new contributor is about to open a PR, **When** they view the PR creation form, **Then** they see a short reminder of the required title format before they type a title.

### Edge Cases

- A PR title passes the Conventional Commits type/format check but uses a type the release pipeline doesn't specifically recognize as `feat` (e.g. `perf:`, `refactor:`, `chore:`) — treated as patch-level, same as `fix:`, per the maintainer's "fix: or otherwise-patch-level" instruction.
- A PR's title is well-formed but an admin merges it despite a failing/skipped title check (e.g. branch protection bypass) — the release pipeline's own bump-detection still runs a defensive parse and falls back to a patch bump rather than failing the whole release outright.
- Two PRs merge in quick succession — the release pipeline processes pushes to `main` sequentially (not concurrently) so the second run always computes its bump from a version that already reflects the first.
- A commit lands on `main` from something other than a merged PR from this repository's standard flow (e.g. a squash-merge in the future, or a repo-admin's direct push) — version tagging is skipped gracefully; base image publishing (`:latest`/`:<sha>`) is unaffected.
- The bot's own chart-version-bump commit lands on `main` — it must not itself be misinterpreted as a new release-worthy PR merge (no infinite loop of version bumps).
- `main`'s branch protection rejects the bot's chart-version-bump push (e.g. no Actions-bypass rule configured) — that step fails visibly, surfacing as a clear signal to the maintainer, without undoing the version tag or Docker image tag already published earlier in the same run.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST validate every pull request's title against the Conventional Commits format (`type(optional-scope)!: subject`, using the type set feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert) whenever a PR is opened, edited, or newly synchronized.
- **FR-002**: The system MUST present a failing, blocking status on any PR whose title does not conform, and a passing status once it does.
- **FR-003**: On every push to `main`, the system MUST determine whether that push corresponds to a merged pull request from this repository, using a method verified to actually work against this repository's real merge history (not assumed from convention).
- **FR-004**: When a push corresponds to a merged PR, the system MUST classify the bump as **major** if the PR title contains a Conventional Commits breaking-change marker (`!` before the colon) or the PR body contains a `BREAKING CHANGE:` (or `BREAKING-CHANGE:`) footer; **minor** if the title's type is `feat` (and it is not already major); otherwise **patch**.
- **FR-005**: The system MUST compute the next version by reading the latest existing semver git tag in the repository (treating the absence of any tag as `v0.0.0`) and applying the classified bump (major resets minor and patch to 0; minor resets patch to 0; patch increments only the patch number).
- **FR-006**: The system MUST create and push a new git tag for the computed version whenever a bump is classified.
- **FR-007**: The system MUST publish the built Docker image under the computed version tag (`ghcr.io/mlopstapus/skillcanon:vX.Y.Z`) in addition to its existing `:latest` and `:<sha>` tags — the existing tags MUST continue to be published on every push to `main` regardless of whether a version bump was classified.
- **FR-008**: When `charts/skillcanon/Chart.yaml` exists on `main`, the system MUST update its `version` and `appVersion` fields to the computed version and push that change back to `main` as part of the same release, using the same token-based authentication pattern already used by this repository's other publishing workflows. When that file does not exist, the system MUST skip this step without failing. If the push itself is rejected (e.g. by branch protection), that step MUST fail visibly rather than silently continuing — this MUST NOT retroactively undo or fail the version tag / Docker image tag already published earlier in the same run.
- **FR-009**: When a push to `main` does not correspond to a resolvable merged PR, the system MUST still publish the `:latest`/`:<sha>` image tags and MUST NOT fail the pipeline solely for lacking a PR to version against.
- **FR-010**: The repository MUST include reference documentation, in the style of the existing `docs/context/*.md` files, explaining the PR title convention, which prefix/marker produces which bump, and worked examples.
- **FR-011**: A contributor creating a new PR MUST be shown a reminder of the required title convention at PR-creation time (not only discoverable by reading separate documentation).

### Key Entities

- **Pull Request title**: The Conventional-Commits-formatted string (`type(scope)!: subject`) a contributor supplies when opening a PR; the sole trusted input the release pipeline classifies a version bump from.
- **Pull Request body / BREAKING CHANGE footer**: Free-text PR description that may contain a `BREAKING CHANGE:` marker, the secondary input used only to detect a major bump when the title itself doesn't carry the `!` marker.
- **Release version**: A semver value (`vMAJOR.MINOR.PATCH`) derived from the previous latest tag plus one classified bump; realized as a git tag and a Docker image tag sharing the same value.
- **Helm chart version fields**: `version`/`appVersion` in `charts/skillcanon/Chart.yaml`, kept equal to the released version once that file exists on `main`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of PRs merged into `main` after this feature ships have titles that were checked against the Conventional Commits format before merge (verifiable via the required status check's history on each merged PR).
- **SC-002**: Every push to `main` that corresponds to a merged, correctly-titled PR results in exactly one new semver git tag and one matching Docker image tag, with no manual version editing by the maintainer.
- **SC-003**: A push to `main` with no resolvable merged PR (e.g. a direct admin push) never fails the pipeline and always still publishes the `:latest`/`:<sha>` image tags, matching current behavior.
- **SC-004**: A contributor can determine the correct PR title format without leaving the PR-creation screen, and can find full documentation with worked examples within one navigation step from the repo root (`docs/context/release-versioning.md`).
- **SC-005**: Once `charts/skillcanon/Chart.yaml` exists on `main`, its `version`/`appVersion` fields never diverge from the most recently published release tag.

## Assumptions

- This repository merges pull requests as real merge commits (not squash merges) — confirmed by inspecting recent merge commit history on `main` — but the merge commit message body does **not** itself contain the originating PR's title, so bump-detection cannot rely on parsing `git log`/commit message text and must resolve the PR via the GitHub API instead.
- `charts/skillcanon/Chart.yaml` does not exist on `main` as of this feature; a sibling, out-of-scope effort (branch `infra/k8s-native-chart`) is expected to introduce it later. This feature's chart-update step must be written to work once that path exists, and must no-op cleanly until then.
- No `.github/pull_request_template.md` exists yet in this repository; adding one (containing the title-convention reminder) is in scope as the most direct way to satisfy "visible at PR-creation time."
- Types other than `feat` that still pass the Conventional Commits format check (`fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`) all bump patch — this matches the maintainer's "fix:-prefixed or otherwise-patch-level" phrasing rather than a stricter release-notes-oriented scheme where some types (e.g. `docs`, `chore`) would not trigger a release at all.
- Direct/admin pushes to `main` that bypass the PR flow are an accepted, ungated edge case for the version-bump portion of this pipeline (no PR title exists to classify from); they are explicitly out of scope for producing a version bump, and this is treated as correct behavior rather than a gap to close.
- Package versioning in `package.json` (currently a static `0.1.0`, unrelated to this release-tag scheme per existing project convention) is out of scope — only git tags, Docker image tags, and the Helm chart's own version fields are kept in sync by this feature.
- The workflow(s) that publish the Docker image today (currently `.github/workflows/docker-publish.yml`) may be restructured (e.g. consolidated into a new release workflow) as needed to avoid two independent jobs both building/pushing the same image tags on every push to `main`; the requirement is that the resulting `:latest`/`:<sha>`/`:vX.Y.Z` tags are all published, not that any particular existing workflow file must survive unchanged.
