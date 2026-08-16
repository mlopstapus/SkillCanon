# Data Model: PR-Title-Driven Semantic Versioning

No database/application data model is involved (Constitution Check: N/A). The "entities" here are the values that flow through the two workflows, shown as their concrete shape and validation rules.

## PullRequestTitle

The string a contributor supplies as a PR's title.

| Field | Type | Rule |
|---|---|---|
| `type` | string | One of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert` (case-insensitive; lower-cased before use) |
| `scope` | string, optional | Free text inside optional `(...)` after `type` |
| `breaking` | boolean | `true` if a bare `!` appears immediately before the `:` |
| `subject` | string | Non-empty, must not end in `.` (validated by `pr-title-lint.yml`) |

Format: `type(scope)?!?: subject` — enforced by `pr-title-lint.yml` before merge; re-parsed defensively (with a patch-bump fallback on non-match) by `release.yml` after merge, since a required check's presence doesn't guarantee every merge went through it (e.g. an admin bypass).

## PullRequestBody

Free-text PR description, used only for one thing: detecting a breaking-change footer the title's `!` marker didn't already capture.

| Field | Type | Rule |
|---|---|---|
| `breakingChangeFooter` | boolean | `true` if any line matches `^BREAKING[ -]CHANGE:` (case-insensitive) |

## BumpType

Derived value, one of exactly three states — no other value is valid.

| Value | Trigger |
|---|---|
| `major` | `PullRequestTitle.breaking` OR `PullRequestBody.breakingChangeFooter` |
| `minor` | not major, and `PullRequestTitle.type == "feat"` |
| `patch` | not major, and `PullRequestTitle.type` is any other passing type (or the title failed to parse at all — defensive default) |

## SuggestedReleaseVersion

**Descoped 2026-08-15**: this value is now purely informational — it is never written anywhere as repository or registry state (no git tag, no image tag, no committed file). It exists only as text in the pipeline run's job summary.

| Field | Type | Rule |
|---|---|---|
| `tag` | string | `vMAJOR.MINOR.PATCH`, e.g. `v1.4.2` — the *suggested* value, not a value that gets created |
| `bare` | string | Same value without the `v` prefix, e.g. `1.4.2` |

Computed as: read the lexicographically-latest `v*` git tag by semver sort (`git tag -l 'v*' --sort=-v:refname | head -n1`), defaulting to `v0.0.0` when no tag exists yet, then applying `BumpType`:
- `major`: `MAJOR += 1`, `MINOR = 0`, `PATCH = 0`
- `minor`: `MINOR += 1`, `PATCH = 0`
- `patch`: `PATCH += 1`

Realized as one thing only: a Markdown block appended to `$GITHUB_STEP_SUMMARY` (research.md Decision 9) naming the suggested tag, the classified bump type, and the source PR's number/title, plus an explicit statement that no tag/release was created automatically.

## HelmChartVersionFields — REMOVED (out of scope)

The original design's `HelmChartVersionFields` entity (auto-updating `charts/skillcanon/Chart.yaml`'s `version`/`appVersion`) no longer exists in this feature — descoped along with git-tag/image-tag automation. See spec.md Assumptions: the chart's version sync is left entirely manual, same as the release tag itself.
