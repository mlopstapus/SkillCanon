# Release Versioning

**Status:** Decided
**Decided:** 2026-08-15
**Spec:** `specs/039-pr-title-semver-versioning/spec.md`

## What this pipeline does — and doesn't — do

**The pipeline tells you what the next version should be; you create the tag/release yourself.** On every merge to `main`, `.github/workflows/release.yml` reads the merged PR's title, works out whether that's a patch/minor/major change, and posts a clearly visible suggestion (in the workflow run's summary) naming the version it would be. That's the entire scope: it never creates a git tag, never publishes a versioned Docker image tag, and never edits or commits any file. Cutting an actual release — tagging the commit, pushing a versioned image, bumping any chart's version field — stays a deliberate, manual action you take when you're ready, on your own schedule.

The merged PR's title still drives that suggestion, though. No separate changelog entry or release-notes form exists — the title you give a PR (or the last title it has when it merges) is the single input the pipeline reads. This is why `.github/workflows/pr-title-lint.yml` blocks a PR from merging at all unless its title is well-formed: by the time `release.yml` runs, it needs to be able to trust that title without re-validating it, even though the only thing it does with that trust is print a suggestion.

## Title format

PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>)<optional !>: <subject>
```

- `<type>` is one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- `<scope>` is optional free text in parentheses (e.g. `feat(cli): ...`) — not validated beyond "must be non-empty if present."
- `<subject>` must be non-empty and must not end in a period.

Examples: `fix: correct null pointer in expand()`, `feat(cli): add sync command`, `chore: bump dependency pins`.

## What triggers which suggestion

| You write | Suggested bump | Example |
|---|---|---|
| `fix: ...` (or any type other than `feat` — `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`) | **Patch** | `v0.3.1` → `v0.3.2` |
| `feat: ...` | **Minor** (patch resets to 0) | `v0.3.1` → `v0.4.0` |
| `feat!: ...` or `fix!: ...` (a `!` right before the colon) | **Major** (minor and patch reset to 0) | `v0.3.1` → `v1.0.0` |
| Any title, if the PR's **body** contains a `BREAKING CHANGE:` footer | **Major**, regardless of the title's own type | `feat: add new field` + a `BREAKING CHANGE: removes the old field` paragraph in the description → `v0.3.1` → `v1.0.0` |

This deliberately treats every passing Conventional Commits type other than `feat` as patch-level — a simpler rule than some Conventional-Commits tooling defaults (which treat `docs`/`chore`/etc. as "no release at all"), chosen because it matches this repo's actual need: every merge to `main` is a candidate for a new version, and the maintainer decides when to actually cut one.

If no release tag exists yet in the repository, the pipeline treats the previous version as `v0.0.0` and suggests the bump from there — this is the real path the repo's first release will take, since no `v*` tag exists as of this writing.

## What gets published automatically, and what doesn't

On every push to `main`, regardless of whether a merged PR was resolved:

- `ghcr.io/mlopstapus/skillcanon:<git-sha>`
- `ghcr.io/mlopstapus/skillcanon:latest`

That's the entire set of automated side effects. When the push corresponds to a merged, correctly-titled PR, the pipeline **additionally posts an informational note** — in the workflow run's job summary, and as a log notice — naming the suggested next version, the classified bump type, and the source PR. It looks like:

> **📦 Next release suggestion**
>
> **minor** version bump suggested: `v0.4.0`
>
> Based on merged PR #42's title: "feat: add caching layer"
>
> No tag or release was created automatically — this is informational only. Create the release by hand (git tag, versioned image tag, and any chart bump) when you're ready.

Nothing about that note changes repository or registry state: **no git tag is created, no Docker image tag beyond `:latest`/`:<git-sha>` is published, and no file — including `charts/skillcanon/Chart.yaml`, once it exists — is edited or committed.** Cutting the actual release (tagging the commit, pushing `ghcr.io/mlopstapus/skillcanon:vX.Y.Z`, bumping a chart's version field) is a manual step you do yourself, whenever you're ready, using the suggested version as your starting point.

A push to `main` with no resolvable merged PR (e.g. a direct admin push) still publishes `:latest`/`:<sha>` and simply produces no suggestion — it never fails the pipeline for lack of a PR to classify.

## Why PR titles, not commit messages

This repo merges PRs as real merge commits (not squash merges), and — verified against its actual history, not assumed — the resulting merge commit carries no PR title anywhere in its message (just `Merge pull request #N from owner/branch`, with an empty body). The release pipeline resolves the merged PR directly via the GitHub API instead of trying to parse commit text, which is also why the title-lint check exists as a hard merge gate: it's the only point in the whole flow where the title is actually validated before the suggestion logic downstream trusts it.

## Why informational-only, not fully automatic

An earlier version of this pipeline created the git tag, published the versioned image tag, and bumped the Helm chart's version field automatically. That turned out to be more automation than wanted — releasing is a decision, not just an arithmetic problem, and the maintainer would rather choose when to cut one than have it happen as a side effect of merging. This pipeline exists to remove the tedious part (figuring out the right next version number) without taking over the part that should stay a deliberate choice.
