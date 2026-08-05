# RCA: PR test gate could not resolve commander

**Date:** 2026-08-04
**Status:** Resolved

## What broke

GitHub PR #60 failed the CI `test` job while running root `pnpm test`. The suite reached `cli/test/commands/sync.test.ts` and failed before executing that file because the test imports `Command` from `commander`, but `commander` was not available from the clean root CI install.

## Causation chain

Symptom: PR #60 `test` gate failed in GitHub Actions.
  ↓ caused by
Root `pnpm test` discovered and imported `cli/test/commands/sync.test.ts`.
  ↓ caused by
That CLI test imports `Command` from `commander`.
  ↓ caused by
CI installs dependencies from the root `package.json` only, and the root package did not declare `commander`.
  ↓ caused by
`commander` was declared only in `cli/package.json`, but the repository is not configured as a pnpm workspace that installs nested CLI package dependencies for root test runs.
  ↓ caused by
**ROOT CAUSE: The root test suite crossed into the nested CLI package without the root dependency graph declaring the CLI runtime dependency it needs.**

## Root cause

Root cause driver: configuration. The repository's root Vitest configuration includes `cli/test/**`, but the root package dependency graph did not include the CLI runtime dependency required by those tests in a clean CI install.

## Contributing factors

- Local verification had previously installed CLI dependencies during investigation, which could mask the clean-root-install condition.
- The repo has no `pnpm-workspace.yaml`; nested package dependencies are not installed as part of root `pnpm install --frozen-lockfile`.

## Evidence gaps

None - the CI log identified the exact missing package import, and the formerly failing CLI sync test was reproduced as passing from the root install after the dependency fix with no `cli/node_modules` present.

## Fix

Declare `commander` as a root dev dependency so root `pnpm test` can resolve the CLI test imports under the same clean install model used by CI.

## Prevention

When root-level test discovery includes nested package tests, dependencies needed by those tests must be available through the root install or the repo should be converted to an explicit workspace with non-conflicting package names and CI installing workspace dependencies.
