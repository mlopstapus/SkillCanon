# Release Versioning

**Status:** Decided
**Decided:** 2026-08-15
**Spec:** `specs/039-pr-title-semver-versioning/spec.md`

## What drives a release

**The merged PR's title drives the version bump.** No separate changelog entry, release-notes form, or manual version edit exists — the title you give a PR when you open it (or the last title it has when it merges) is the single input the release pipeline trusts. This is why `.github/workflows/pr-title-lint.yml` blocks a PR from merging at all unless its title is well-formed: by the time `.github/workflows/release.yml` runs, it needs to be able to trust that title without re-validating it.

## Title format

PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>)<optional !>: <subject>
```

- `<type>` is one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- `<scope>` is optional free text in parentheses (e.g. `feat(cli): ...`) — not validated beyond "must be non-empty if present."
- `<subject>` must be non-empty and must not end in a period.

Examples: `fix: correct null pointer in expand()`, `feat(cli): add sync command`, `chore: bump dependency pins`.

## What triggers which bump

| You write | Bump | Example |
|---|---|---|
| `fix: ...` (or any type other than `feat` — `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`) | **Patch** | `v0.3.1` → `v0.3.2` |
| `feat: ...` | **Minor** (patch resets to 0) | `v0.3.1` → `v0.4.0` |
| `feat!: ...` or `fix!: ...` (a `!` right before the colon) | **Major** (minor and patch reset to 0) | `v0.3.1` → `v1.0.0` |
| Any title, if the PR's **body** contains a `BREAKING CHANGE:` footer | **Major**, regardless of the title's own type | `feat: add new field` + a `BREAKING CHANGE: removes the old field` paragraph in the description → `v0.3.1` → `v1.0.0` |

This deliberately treats every passing Conventional Commits type other than `feat` as patch-level — a simpler rule than some Conventional-Commits tooling defaults (which treat `docs`/`chore`/etc. as "no release at all"), chosen because it matches this repo's actual need: every merge to `main` should produce a new, unambiguously versioned image.

If no release tag exists yet in the repository, the pipeline treats the previous version as `v0.0.0` and bumps from there — this is the real path the repo's first release will take, since no `v*` tag exists as of this writing.

## What gets published

On every push to `main`, regardless of whether a version bump was classified:

- `ghcr.io/mlopstapus/skillcanon:<git-sha>`
- `ghcr.io/mlopstapus/skillcanon:latest`

Additionally, when the push corresponds to a merged, correctly-titled PR:

- A git tag `vMAJOR.MINOR.PATCH` on the merge commit.
- `ghcr.io/mlopstapus/skillcanon:vMAJOR.MINOR.PATCH` — the exact same image as that run's `:<git-sha>` tag, just retagged.
- Once `charts/skillcanon/Chart.yaml` exists on `main` (it doesn't today — see `CLAUDE.md`'s note on the in-progress Helm chart rework), its `version` and `appVersion` fields are updated to match, in a small bot commit pushed back to `main`.

A push to `main` with no resolvable merged PR (e.g. a direct admin push) still publishes `:latest`/`:<sha>` and simply skips the tagging step — it never fails the pipeline for lack of a PR to version against.

## Why PR titles, not commit messages

This repo merges PRs as real merge commits (not squash merges), and — verified against its actual history, not assumed — the resulting merge commit carries no PR title anywhere in its message (just `Merge pull request #N from owner/branch`, with an empty body). The release pipeline resolves the merged PR directly via the GitHub API instead of trying to parse commit text, which is also why the title-lint check exists as a hard merge gate: it's the only point in the whole flow where the title is actually validated before the version-bump logic downstream trusts it.
