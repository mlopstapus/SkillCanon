# Implementation Plan: PR-Title-Driven Semantic Versioning

**Branch**: `release/pr-title-semver-versioning` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/039-pr-title-semver-versioning/spec.md`

## Summary

Enforce Conventional Commits PR titles at merge time via a required GitHub Actions status check, then on every push to `main` resolve the merged PR (via the GitHub API, not the merge commit message — this repo's real merge commits carry no PR title, confirmed against actual history) and use its title/body to classify a semver bump (patch/minor/major), compute the next version from the latest git tag, publish that version as a git tag and a Docker image tag alongside the existing `:latest`/`:<sha>` tags, and — once `charts/skillcanon/Chart.yaml` exists on `main` — bump its `version`/`appVersion` fields in a bot commit pushed back to `main`. Ship reference docs (`docs/context/release-versioning.md`) and a PR template reminder so the convention is discoverable both up front (opening a PR) and after the fact (docs).

## Technical Context

**Language/Version**: GitHub Actions workflow YAML + POSIX `bash` (matches every existing workflow in `.github/workflows/`); no application code changes.

**Primary Dependencies**: `amannn/action-semantic-pull-request@v5` (marketplace action, PR-title lint only); GitHub's `gh` CLI (preinstalled on `ubuntu-latest` runners) for the `commits/{sha}/pulls` API lookup and `gh pr view`; `jq` (preinstalled) for JSON parsing; `docker`/`git` (already used by existing workflows).

**Storage**: N/A — state lives in git tags and the GHCR image registry, no database involved.

**Testing**: No unit-test framework exists for GitHub Actions workflow YAML in this repo (nothing under `docs/context/testing-strategy.md` covers CI config). Verification is `actionlint` (locally installed, confirmed) for static YAML/shellcheck correctness, plus a manual trace of each Technical Context path (merged-PR / no-PR / chart-file-present / chart-file-absent / breaking-change-footer) against real repo data (existing merge commits, existing tags) documented in `quickstart.md`, since there is no way to trigger a real `push`/`pull_request` event locally.

**Target Platform**: GitHub Actions (`ubuntu-latest` runners), triggered by GitHub's own `pull_request` and `push` webhook events on this repository.

**Project Type**: CI/CD pipeline configuration (`.github/workflows/*.yml`) plus static documentation (`docs/context/*.md`, `.github/pull_request_template.md`) — no `src/` changes.

**Performance Goals**: N/A — a release runs once per merge to `main`; no latency/throughput target applies.

**Constraints**: Must not remove the existing `:latest`/`:<sha>` Docker tags or their current always-publish-on-every-push behavior (FR-007, FR-009). Must not fail the pipeline when no merged PR can be resolved (FR-009) or when `charts/skillcanon/Chart.yaml` doesn't exist yet (FR-008). Chart-bump push failures must fail visibly without retroactively invalidating an already-published tag/image (per Clarifications).

**Scale/Scope**: Two new/changed GitHub Actions workflows, one new docs page, one new PR template. Single-repository scope; no fan-out to other repos or services.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is written for the application's Python/FastAPI + Next.js backend/frontend and its tenant-scoped data model (Principles I–VIII: TDD on backend logic, bounded contexts, domain invariants, multi-tenant RLS, secrets hashing, audit logging, entitlement gating, UI accessibility). This feature touches none of that surface — it adds no backend logic, no database table, no tenant-scoped resource, no UI page, and introduces no new secret (it reuses the ambient, GitHub-managed `GITHUB_TOKEN`, never a hand-provisioned credential). Gate-by-gate:

| Principle | Applies? | Disposition |
|---|---|---|
| I. Test-First Development | No | No backend/domain logic is added; nothing under `src/` changes. Substituted with `actionlint` + documented manual trace per Technical Context > Testing above. |
| II. Domain-Driven Bounded Contexts | No | No bounded context is touched. |
| III. Domain Invariants in Domain Layer | No | No domain model involved. |
| IV. Multi-Tenant Isolation | No | No tenant-scoped data. |
| V. Secure by Default | Partial | No new secret is introduced (reuses ambient `GITHUB_TOKEN`, same pattern as every existing publish workflow); no security-critical setting ships with a functional placeholder default. Satisfied by construction, not by a new control. |
| VI. Auditable & Compliant (SOC2) | No | No mutation of application/tenant data; GitHub's own Actions run log is the audit trail for this pipeline, consistent with how the repo's existing publish workflows are already treated. |
| VII. Feature-Gated by Entitlement | No | Not a product feature; nothing to gate behind `resolveEntitlements()`. |
| VIII. Consistent, Accessible UI | No | No UI surface changes. |

No violations requiring justification. Complexity Tracking table is omitted (nothing to fill).

## Project Structure

### Documentation (this feature)

```text
specs/039-pr-title-semver-versioning/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
│   └── release-pipeline.md
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
.github/
├── workflows/
│   ├── pr-title-lint.yml     # NEW — pull_request title check (required status check)
│   ├── release.yml           # NEW — push-to-main: publish sha/latest/version image tags,
│   │                         #        create+push git tag, bump Chart.yaml when present
│   └── docker-publish.yml    # REMOVED — its always-run sha/latest publish is folded into
│                             #           release.yml to avoid two workflows racing to
│                             #           `docker build .`/push the same tags on every push
│                             #           to main (see research.md Decision 5)
└── pull_request_template.md  # NEW — short title-convention reminder shown at PR-creation time

docs/context/
└── release-versioning.md     # NEW — convention reference doc, matches existing docs/context/*.md tone

charts/skillcanon/Chart.yaml   # NOT present in this repo/branch today — release.yml's chart-bump
                                # step targets this path defensively (guarded, no-ops if absent)
                                # for when a sibling, out-of-scope effort introduces it later
```

**Structure Decision**: Everything lives under `.github/` and `docs/context/` — this is CI/CD configuration and reference documentation, not an application feature, so none of the template's `src/`/`backend//frontend/`/`api/` options apply. No new source directory is created.

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*
