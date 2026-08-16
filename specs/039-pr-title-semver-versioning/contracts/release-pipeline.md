# Contract: Release Pipeline Workflows

The "interfaces" this feature exposes are GitHub Actions triggers/status-checks and published artifacts (git tags, container image tags), not an API. Documented here so a consumer (a contributor opening a PR, or something automated depending on the published tags) knows exactly what to expect.

## `pr-title-lint.yml`

**Trigger**: `pull_request` events `opened`, `edited`, `synchronize`, targeting `main`.

**Produces**: A GitHub status check named per the `amannn/action-semantic-pull-request` action's default check name (`Semantic Pull Request`), `success` if the PR title matches `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+$` (non-empty subject, no trailing period) and `failure` otherwise, with an explanatory PR comment on failure.

**Consumer action required (out of band)**: This check is **not** automatically "required" — GitHub branch protection must be configured (by a repo admin, in Settings → Branches) to require the `Semantic Pull Request` status check before merge is blocked. This workflow file alone only produces the check; it cannot itself modify branch-protection settings. Flagged explicitly in this feature's final report.

## `release.yml`

**Trigger**: `push` to `main` (i.e., every merge, and any direct push).

**Always produces** (regardless of whether a PR was resolved):
- `ghcr.io/mlopstapus/skillcanon:<git-sha>`
- `ghcr.io/mlopstapus/skillcanon:latest`

**Additionally produces, only when the push resolves to a merged PR** (see research.md Decision 1):
- An annotated git tag `vMAJOR.MINOR.PATCH` on the merge commit, pushed to `origin`.
- `ghcr.io/mlopstapus/skillcanon:vMAJOR.MINOR.PATCH` (same image bytes as the `:<git-sha>` tag from the same run).
- If `charts/skillcanon/Chart.yaml` exists on `main`: a follow-up commit on `main` (authored as `github-actions[bot]`) updating its `version`/`appVersion` fields to `MAJOR.MINOR.PATCH`, with commit message `chore(release): bump chart version to MAJOR.MINOR.PATCH [skip ci]`.

**Never fails the run for**:
- No merged PR resolvable for the push (logs `::notice::`, skips version tagging only).
- `charts/skillcanon/Chart.yaml` not existing (logs `::notice::`, skips the chart step only).

**Fails the run for**:
- The chart-bump commit being rejected when pushed to `main` (e.g. branch protection with no Actions-bypass rule) — visible job failure, by design (Clarifications). This does not retroactively fail or undo the tag/image steps that already succeeded earlier in the same run.

## Required permissions

| Workflow | `permissions` block | Why |
|---|---|---|
| `pr-title-lint.yml` | `pull-requests: read`, `statuses: write` | Read PR title/metadata, write the check status. |
| `release.yml` | `contents: write`, `packages: write`, `pull-requests: read` | `contents: write` for tag + chart-bump-commit push; `packages: write` for GHCR push; `pull-requests: read` for the `commits/{sha}/pulls`/`gh pr view` lookups. |

Both use the ambient, repo-scoped `secrets.GITHUB_TOKEN` — no new PAT or secret is introduced (research.md Decision 8).
