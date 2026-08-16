# Contract: Release Pipeline Workflows

The "interfaces" this feature exposes are GitHub Actions triggers/status-checks and a run summary, not an API. Documented here so a consumer (a contributor opening a PR, or the maintainer reading a run) knows exactly what to expect.

**Descoped 2026-08-15**: this feature no longer creates git tags, publishes versioned image tags, or edits/commits any file. It suggests a version, informationally, and stops there. See spec.md Clarifications for the full rationale.

## `pr-title-lint.yml`

Unchanged by the descope. **Trigger**: `pull_request` events `opened`, `edited`, `synchronize`, targeting `main`.

**Produces**: A GitHub status check named per the `amannn/action-semantic-pull-request` action's default check name (`Semantic Pull Request`), `success` if the PR title matches `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+$` (non-empty subject, no trailing period) and `failure` otherwise, with an explanatory PR comment on failure.

**Consumer action required (out of band)**: This check is **not** automatically "required" — GitHub branch protection must be configured (by a repo admin, in Settings → Branches) to require the `Semantic Pull Request` status check before merge is blocked. This workflow file alone only produces the check; it cannot itself modify branch-protection settings. Flagged explicitly in this feature's final report.

## `release.yml`

**Trigger**: `push` to `main` (i.e., every merge, and any direct push).

**Always produces** (regardless of whether a PR was resolved):
- `ghcr.io/mlopstapus/skillcanon:<git-sha>`
- `ghcr.io/mlopstapus/skillcanon:latest`

**Additionally produces, only when the push resolves to a merged PR** (see research.md Decision 1):
- A Markdown block appended to the run's `$GITHUB_STEP_SUMMARY` stating: the source PR's number and title, the classified bump type (major/minor/patch), the suggested next version (`vMAJOR.MINOR.PATCH`), and an explicit sentence that no tag or release was created automatically.
- A matching `::notice::` log annotation with the same suggestion, for anyone scanning the raw run log rather than the summary tab.

**Never produces, under any circumstance** (this is the core contract change from the original design):
- A git tag.
- Any Docker image tag beyond `:latest`/`:<git-sha>`.
- A commit to `main`, or an edit to any file in the repository.

**Never fails the run for**:
- No merged PR resolvable for the push (logs `::notice::`, produces no suggestion).

## Required permissions

| Workflow | `permissions` block | Why |
|---|---|---|
| `pr-title-lint.yml` | `pull-requests: read`, `statuses: write` | Read PR title/metadata, write the check status. |
| `release.yml` | `contents: read`, `packages: write`, `pull-requests: read` | `contents: read` for `actions/checkout` (and reading existing tags to compute the suggestion) — note this is **read**, not the `contents: write` the original auto-tagging design needed; `packages: write` for GHCR push; `pull-requests: read` for the `commits/{sha}/pulls`/`gh pr view` lookups. Nothing in this workflow pushes a tag or a commit, so no write grant on `contents` is needed at all anymore. |

Both use the ambient, repo-scoped `secrets.GITHUB_TOKEN` — no new PAT or secret is introduced.
