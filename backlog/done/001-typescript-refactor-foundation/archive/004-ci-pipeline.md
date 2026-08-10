---
epic: 001-typescript-refactor-foundation
feature: 004-ci-pipeline
status: done
dependencies: ["backlog/000-foundations/003-testing-strategy.md"]
---

# CI Pipeline

Wire lint, typecheck, and test into GitHub Actions so every PR is gated before merge, matching the current repo's existing `.github/workflows/` pattern but extended to the new TS stack. Per tenet P1, tests are the only correctness signal available (still no static type checker beyond TS itself catching type errors, not domain invariants) — CI is what makes that signal actually gate merges instead of being advisory.

## Requirements

- [x] GitHub Actions workflow runs on every PR: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (`.github/workflows/ci.yml`)
- [x] Test job spins up a real Postgres instance (per `context/testing-strategy.md`'s Testcontainers-or-equivalent decision) so integration and RLS tests can run in CI, not just unit tests (no CI-level `services:` block needed — the existing `startTestDb()`/Testcontainers helper self-provisions per test file; `ci.yml`'s `test` job only needs the runner's Docker daemon)
- [x] Module-boundary lint rule (`003-module-boundary-lint-enforcement`) runs as part of the lint step (the `lint` job runs `pnpm lint`, which already includes it — no separate step)
- [x] Build step (`pnpm build`) runs and must succeed before merge (`build` job, gated by `ci-gate`)
- [x] Docker image build step, producing the same image used for both self-hosted distribution and the AWS SaaS deploy (per PDR-006's single-repo model) — root `Dockerfile` authored, `docker-build` job builds it on every PR (no push), `docker-publish.yml` pushes to `ghcr.io/mlopstapus/skillcanon` on merge to `main`; verified locally that the built image runs and serves HTTP 200
- [x] Workflow status is a required check on the `main` branch — `ci-gate` job exists and is designed as the single required check (see `specs/004-ci-pipeline/contracts/required-check.md`); the workflow itself ran and gated a real PR (#20: lint/typecheck/test/build/docker-build/ci-gate all `SUCCESS`, then merged). **Known limitation**: `main`'s branch protection setting itself was not configured to require `ci-gate` (confirmed via `gh api repos/:owner/:repo/branches/main/protection` → 404 "Branch not protected") — a failing PR could still be merged manually today. Accepted as done regardless, per explicit user decision (2026-07-22), matching how `003-module-boundary-lint-enforcement` was archived with its own analogous gap.

## Acceptance Criteria

- [x] A PR with a failing test is blocked from merging — the workflow's `test` job would fail and `ci-gate` would fail with it (never actually exercised with a deliberately-failing PR); **not truly enforced yet** since `main`'s branch protection isn't configured (see Requirements note above) — a failing PR could still be merged manually. Accepted as done per explicit user decision (2026-07-22).
- [x] A PR with a lint violation (including a module-boundary violation) is blocked from merging — same caveat as above: the `lint` job would fail, but nothing currently prevents a manual merge past that failure.
- [x] A PR with a passing empty test suite merges cleanly — **genuinely verified**: PR #20 ran lint/typecheck/test/build/docker-build/`ci-gate`, all `SUCCESS`, and merged.
- [x] CI run completes in a reasonable time budget (target: under 5 minutes) — **genuinely verified**: PR #20's full workflow run completed in 55 seconds.

## Open Questions

- ~~Does the Docker image build run on every PR (slower, catches build breaks early) or only on merge to `main` (faster PR feedback)? Lean toward PR-time given the image is also what self-hosters pull.~~ **Resolved** via `/speckit-clarify` (see `specs/004-ci-pipeline/spec.md` Clarifications, 2026-07-21): build on every PR (no push), push to the registry only on merge to `main`.

## Dependencies

- `backlog/000-foundations/003-testing-strategy.md`
- `002-drizzle-shared-db-kernel.md` (CI's Postgres test setup depends on the DB kernel existing)

## Technical Notes

This pipeline is what the old `.github/workflows/helm-publish.yml` gets replaced/extended by — confirm whether Helm chart publishing (still needed per the architecture's "keep both deployment targets" decision) stays a separate workflow or gets folded into this one.
