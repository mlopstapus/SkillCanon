# Quickstart: Validating the Release Pipeline

There is no way to fire a real `pull_request`/`push` GitHub Actions event from this environment, so validation is static (YAML/shellcheck correctness) plus a manual trace of each workflow's logic against this repository's real, already-observed data (existing merge commits, existing tags, current file layout). Full, real end-to-end confidence only comes from the first live PR merge after this ships — flagged as a residual risk in the feature's final report.

## Prerequisites

- `actionlint` installed locally (confirmed at `/opt/homebrew/bin/actionlint`, v1.7.12).
- Repo checked out on `release/pr-title-semver-versioning`.

## 1. Static workflow validation

```bash
actionlint .github/workflows/pr-title-lint.yml .github/workflows/release.yml
```

**Expected**: no output, exit code `0`. (A first draft hit shellcheck `SC1072`/`SC1073` on the bump-classification regex — see research.md Decision 6 for the fix; re-running after that fix must be clean.)

## 2. Trace: PR title lint accepts/rejects the right titles

No live PR needed — the accepted format is fully specified in `contracts/release-pipeline.md`. Manually check a representative set of titles against `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+$`:

| Title | Expected |
|---|---|
| `update readme` | fails (no type) |
| `docs: update readme` | passes |
| `feat: add caching layer` | passes |
| `feat(cli): add sync command` | passes |
| `feat!: drop legacy config format` | passes (breaking marker accepted) |
| `Fix: Something.` | fails (subject ends in period, per `subjectPattern`) |

## 3. Trace: bump classification against real repo history

Using `git log -1 --format=%B <sha>` on a handful of this repo's actual recent merge commits (`cdd8c93`, `bab5960`, ...) confirms the message body is empty — i.e. confirms `release.yml` genuinely cannot use commit-message parsing and must hit the `commits/{sha}/pulls` API, matching research.md Decision 1. This was verified once during planning; re-verify if this repo's merge strategy or GitHub's default merge-commit template ever changes:

```bash
git log -1 --format=%B <recent-merge-sha>
```

## 4. Trace: version computation against current tag state

```bash
git tag -l 'v*' --sort=-v:refname | head -n1
```

**Expected today**: empty output (no `v*` tags exist yet in this repo) — confirms `release.yml`'s "no tag yet → treat as `v0.0.0`" path (FR-005, Edge Cases) is the one that will actually exercise on this repo's first release, not a hypothetical.

## 5. Trace: chart-file guard

```bash
test -f charts/skillcanon/Chart.yaml && echo present || echo absent
```

**Expected today**: `absent` — confirms the chart-bump step's existence guard is exercised for real on every run until the sibling `infra/k8s-native-chart` effort lands that file.

## 6. Manual review checklist (no local execution possible)

- [ ] `release.yml`'s `docker tag`/`docker push` for the version tag references the image built earlier in the *same job* (no re-pull), per research.md Decision 5.
- [ ] Every step that depends on PR resolution (`steps.pr.outputs.found == 'true'`) is correctly gated, and the job overall still reports success when no PR is found.
- [ ] `permissions:` blocks match `contracts/release-pipeline.md`'s table exactly (least-privilege, no broader grant than listed).
- [ ] `pr-title-lint.yml`'s `types` list matches `release.yml`'s bump-classification type set exactly (both hand-authored, must stay in sync — no shared source of truth between them by construction).

## Post-merge real-world validation (for the maintainer, after this ships)

1. Add the `Semantic Pull Request` check to `main`'s required status checks in GitHub branch-protection settings (this workflow cannot do this itself — see `contracts/release-pipeline.md`).
2. Open a real PR titled e.g. `fix: <something small>`, confirm the title-lint check appears and passes.
3. Merge it, then confirm in the Actions tab that `release.yml` ran, created tag `v0.0.1`, and published `ghcr.io/mlopstapus/skillcanon:v0.0.1`.
4. Confirm `docker-publish.yml` no longer appears as a separate workflow run (superseded — research.md Decision 5).
