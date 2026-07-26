# RCA: ESLint boundary test timed out

**Date:** 2026-07-26
**Status:** Resolved

## What broke

The full Vitest suite failed because the first test in `eslint.config.test.ts` exceeded Vitest's default 5000ms timeout while waiting for `ESLint.lintText()` to return.

## Causation chain

Symptom: `eslint.config.test.ts` failed with `Test timed out in 5000ms`.
  ↓ caused by
The first `ESLint.lintText()` invocation in the file took just over 5 seconds on a cold ESLint instance.
  ↓ caused by
That test pays the cold config/plugin initialization cost for ESLint and `eslint-plugin-boundaries`, while later tests reuse warmed state and finish faster.
  ↓ caused by
**ROOT CAUSE: The integration-style lint test used Vitest's default unit-test timeout despite depending on cold ESLint startup work.**

## Root cause

Configuration/test-runtime gap: the test budget assumed lintText behaves like a lightweight unit test, but the first call performs integration work that can legitimately exceed 5 seconds in this environment.

## Contributing factors

- The timeout affected only the first test, which made the suite look flaky or load-sensitive.
- The full suite's Testcontainers workload made the same tight timeout easier to hit.

## Evidence gaps

None. Reproduced locally by running `corepack pnpm vitest run eslint.config.test.ts`; the same first test timed out at about 5.1 seconds.

## Fix

Raise the timeout for the cold-start boundary-lint test to 15 seconds while keeping the assertion behavior unchanged.

## Prevention

Keep integration-style tests that invoke external analyzers, build tools, or containerized dependencies on explicit timeouts rather than Vitest's default unit-test budget.
