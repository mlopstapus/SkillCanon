# Research: PR-Title-Driven Semantic Versioning

## Decision 1: How to resolve "which PR did this push-to-main come from"

**Decision**: Call the GitHub REST API `GET /repos/{owner}/{repo}/commits/{sha}/pulls` (via `gh api`) with `github.sha` from the `push` event, filter to entries with a non-null `merged_at`, and prefer the one whose `merge_commit_sha` equals `github.sha` (falling back to the first merged result). Pull the title/body from that PR via `gh pr view <number> --json title,body`.

**Rationale**: Verified directly against this repository's actual history rather than assumed. `git log -1 --format=%B` on several recent merge commits (e.g. `cdd8c93`, `bab5960`) shows the commit message body is empty — just `Merge pull request #N from owner/branch`, with **no PR title anywhere in the message**. A commit-message-parsing approach (common advice for squash-merge repos, where the squash commit's first line *is* the PR title) would silently never work here. `commits/{sha}/pulls` is GitHub's own documented mechanism for "which PR(s) is this commit part of" and works regardless of merge strategy (merge commit, squash, or rebase), which also future-proofs this if the repo's merge strategy ever changes.

**Alternatives considered**:
- *Parse `git log`/merge commit message*: Rejected — verified empirically to carry no usable data in this repo (see above).
- *`GITHUB_HEAD_REF`/`GITHUB_BASE_REF`*: Not populated on `push` events (only on `pull_request` events) — not usable from `release.yml`'s trigger.
- *GitHub Search API (`search/issues?q=is:pr+is:merged+sha:...`)*: The `sha:` search qualifier is unreliable/undocumented for this exact use case; `commits/{sha}/pulls` is the purpose-built, documented endpoint.

## Decision 2: PR title lint mechanism

**Decision**: `amannn/action-semantic-pull-request@v5`, a widely-used, actively maintained marketplace action built specifically for Conventional-Commits PR title enforcement.

**Rationale**: The check only needs to validate a title format — a well-established, narrow problem this action already solves correctly (including the `!` breaking-change marker via its default type/scope regex), is configurable via `types`/`requireScope`/`subjectPattern` inputs to match this repo's exact type set, and posts a clear failing/passing status + an explanatory PR comment on failure. Writing a custom regex script would duplicate well-tested logic for no real benefit — this is exactly the kind of narrow, self-contained problem a marketplace action is the right tool for, versus e.g. the repo's own multi-job CI pipeline (`ci.yml`) or GHCR publish auth, which stayed hand-written because they're repo-specific.

**Alternatives considered**:
- *Custom bash/regex script in a workflow step*: Would need to reimplement type/scope/breaking-marker parsing and re-derive good error messaging; no material benefit over the marketplace action for this narrow a check.
- *`conventional-changelog`/`commitlint` via Node*: Built for commit-message linting across a whole history, heavier (npm install in CI) than this single-title check needs.

## Decision 3: `pr-title-lint.yml` as a separate workflow file, not a job inside `ci.yml`

**Decision**: New standalone `.github/workflows/pr-title-lint.yml`, not a job added to the existing `ci.yml`'s job list.

**Rationale**: `ci.yml` triggers on `pull_request: branches: [main]` with default types (`opened`, `synchronize`, `reopened`) and every job in it (lint/typecheck/test/build/docker-build) is deliberately heavy and expensive. The title check specifically needs `edited` in its trigger types too (so retitling an already-open PR re-validates without new commits), and adding `edited` to `ci.yml`'s shared trigger would re-run all five expensive jobs on every title edit — wasteful and against the spirit of `ci.yml`'s existing job set. A separate workflow with its own narrow trigger avoids this at the cost of being a second required status check rather than folding into `ci-gate`'s single aggregate check (`CLAUDE.md`'s documented convention for *new CI jobs*). This is a deliberate, documented exception to that convention for exactly this reason — flagged explicitly in this feature's final report as something the maintainer needs to add to GitHub's branch-protection required-checks list by hand, since no workflow file can modify repository branch-protection settings.

**Alternatives considered**:
- *Add `edited` to `ci.yml`'s top-level trigger and a `pr-title-lint` job to `ci-gate`'s `needs:`*: Rejected — would re-run lint/typecheck/test/build/docker-build on every title-only edit.
- *Keep `ci.yml`'s trigger as-is and add the job without `edited` support*: Rejected — an already-open PR whose title gets fixed after initial failure would never re-check without a new commit, undermining FR-002's "passes once corrected" requirement.

## Decision 4: Bump classification

**Decision**: Parse the resolved PR title against `^([a-zA-Z]+)(\([^)]*\))?(!)?:\ .+` (bash `[[ =~ ]]`, regex held in a variable — see Decision 6 for why). Breaking (`!` present, or PR body contains a `^BREAKING[ -]CHANGE:` line) → major. Else `type == feat` → minor. Else (any other passing Conventional Commits type — `fix`/`docs`/`style`/`refactor`/`perf`/`test`/`build`/`ci`/`chore`/`revert`) → patch. A title that fails to match at all (defensive fallback for an admin-merge bypassing the required check) defaults to patch, matching "fix:-prefixed or otherwise-patch-level" from the original request, and logs a `::warning::` so it's visible in the run log.

**Rationale**: Directly implements spec FR-004/FR-005 and the maintainer's explicit rule. Deliberately simpler than tools like `semantic-release`'s default config (which treats `docs`/`chore`/etc. as *no release*) — the spec's Assumptions section records this as an intentional divergence matching the maintainer's own phrasing, not an oversight.

**Alternatives considered**:
- *`semantic-release`/`release-please` as a full tool*: Rejected as disproportionate — both expect to own changelog generation and npm-publish-style release flows this repo doesn't want; the maintainer's rules are simple enough to implement directly in ~30 lines of bash with full visibility into the exact logic, matching this repo's existing preference for small hand-written workflow scripts over adopting a heavier tool (see Decision 2's reasoning applied in the opposite direction — bump *classification* is repo-specific business logic, not a generic problem).

## Decision 5: Consolidate `docker-publish.yml` into `release.yml`

**Decision**: Delete `.github/workflows/docker-publish.yml`; `release.yml` performs the unconditional `docker build` + push of `:<sha>`/`:latest` itself (identical to today's behavior), then additionally tags/pushes `:vX.Y.Z` when a bump was classified.

**Rationale**: Both files would otherwise trigger on the identical `push: branches: [main]` event and independently run `docker build .` against the same tags — a wasted duplicate build and a real race (two jobs pushing `:latest` to the same repository concurrently, order undefined). GitHub Actions has no cross-workflow `needs:`, so serializing two separate workflow files safely would require an awkward `workflow_run` chain. Consolidating into one job's step sequence is simpler, guarantees ordering (the version tag is applied to the exact image just built, via `docker tag` on the same runner's local image, not a re-pull), and is a strict superset of `docker-publish.yml`'s existing behavior (FR-007's "don't remove those, add to them" is satisfied — the tags keep publishing, just from one file instead of two).

**Alternatives considered**:
- *Keep both files, `release.yml` re-pulls `:<sha>` after `docker-publish.yml` finishes*: Rejected — no reliable ordering guarantee between two independently-triggered workflows without `workflow_run`, which adds a second webhook hop and its own edge cases (a `workflow_run`-triggered workflow doesn't have direct access to the same `push` event context) for no benefit over just doing it in one job.
- *`workflow_run` chaining*: Rejected as unnecessary complexity for what's naturally one job's linear step sequence.

## Decision 6: `actionlint`/shellcheck compatibility for the bump-classification regex

**Decision**: Store the Conventional Commits regex in a shell variable (`CONVENTIONAL_TITLE_RE='...'`) and reference it as `[[ "${TITLE}" =~ ${CONVENTIONAL_TITLE_RE} ]]`, rather than inlining the regex literal inside the `[[ ... ]]` test.

**Rationale**: `actionlint` (confirmed installed locally at `/opt/homebrew/bin/actionlint`, v1.7.12) runs `shellcheck` against embedded `run:` scripts. An inline regex containing a bracket-expression character class (`[^)]`) inside `[[ ... =~ ... ]]` triggers spurious `SC1072`/`SC1073` parse errors from shellcheck's bash parser (confirmed by running `actionlint` against a first draft of this exact line). Moving the regex into a plain variable and referencing it unquoted sidesteps shellcheck's attempt to parse the regex's own bracket syntax as test-expression syntax — a known, documented shellcheck quirk, not a real bug in the original regex.

**Alternatives considered**:
- *`# shellcheck disable=SC1072,SC1073` inline*: Would silence the check without fixing the actual parseability concern the check exists to catch; the variable form is strictly better since it's both cleaner and lint-clean.

## Decision 7 (SUPERSEDED): Chart.yaml field update mechanism

**Status**: Superseded 2026-08-15 — the entire chart-bump mechanism was descoped (see spec.md Clarifications). Kept for history only; `release.yml` no longer touches `charts/skillcanon/Chart.yaml` in any way.

<details>
<summary>Original decision (no longer implemented)</summary>

**Decision**: `sed -i.bak -E 's/^version:.*/version: X.Y.Z/'` / same for `appVersion` (quoted), against `charts/skillcanon/Chart.yaml`, guarded by a `[ -f "$CHART_FILE" ]` existence check that no-ops (with a `::notice::`) rather than failing when the path is absent.

**Rationale**: `charts/skillcanon/Chart.yaml` doesn't exist on `main` today (only the legacy `charts/spechub/` tree does) — confirmed via `find charts -maxdepth 3`. A tool like `yq` isn't confirmed present on `ubuntu-latest` by default for this exact use, and a two-line `sed` against a conventional, hand-authored `Chart.yaml`'s top-level `version:`/`appVersion:` keys is simple, dependency-free, and easy to verify by eye in review.

</details>

## Decision 8 (SUPERSEDED): Push-back-to-main auth pattern for the chart-bump commit

**Status**: Superseded 2026-08-15 — no commit is ever pushed back to `main` by this feature anymore. Kept for history only.

<details>
<summary>Original decision (no longer implemented)</summary>

**Decision**: `git config user.name "github-actions[bot]"` / matching noreply email, then `git push origin HEAD:main` using the same ambient `GITHUB_TOKEN` already used for GHCR login elsewhere in the job (`permissions: contents: write`). No PAT, no separate secret.

**Rationale**: Matches the (now-superseded) Clarifications decision (direct push, fail loudly if rejected) and mirrors this repo's existing convention of every workflow authenticating with the ambient `GITHUB_TOKEN` rather than a custom PAT.

</details>

## Decision 9: Mechanism for the informational version-suggestion note

**Decision**: Write to `$GITHUB_STEP_SUMMARY` (GitHub Actions' built-in job-summary Markdown file) as the sole delivery mechanism — not a PR comment via `gh pr comment`.

**Rationale**: `$GITHUB_STEP_SUMMARY` needs zero extra permissions beyond what the job already has (it's a plain file write, not an API call), renders as formatted Markdown directly on the workflow run page, and is exactly as visible to "whoever's looking at why this push ran" as the run itself — which is the actual audience (the person about to decide whether to cut a release), not the PR's own conversation thread (which is typically already closed/merged and less likely to be revisited specifically to check for a version suggestion). A `gh pr comment` was considered and is genuinely more discoverable *from the PR itself*, but adds a `pull-requests: write` permission grant for a purely cosmetic upgrade over the job summary, and posts a comment on an already-merged PR that has nothing further to review — judged not worth the added permission scope for this descoped, informational-only feature. Revisit if the maintainer finds the job summary insufficiently visible in practice.

**Alternatives considered**:
- *`gh pr comment` on the merged PR*: More visible in one specific place (the PR thread) but requires `pull-requests: write` (a broader grant than this job otherwise needs) and comments on a PR that's already done being discussed.
- *Both simultaneously*: Rejected as needless duplication for a single, low-stakes, informational message — one clear channel is enough, and doing both would mean two places that could theoretically say slightly different things if ever touched independently later.
- *A `::notice::` workflow annotation only*: Considered and rejected as the *sole* channel — annotations are easy to miss among other log noise and don't render as nicely as a summary's Markdown table, though the implementation still emits one alongside the summary for anyone scanning the log directly.
