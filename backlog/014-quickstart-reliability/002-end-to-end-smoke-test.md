---
epic: 014-quickstart-reliability
feature: 002-end-to-end-smoke-test
status: open
dependencies: [001-run-migrations-in-compose]
---

# End-to-End Smoke Test

One Playwright test, run in CI against `docker compose up`, that walks the path a new user takes.

**Started 2026-10-29:** `e2e/ui-walk.e2e.test.ts` (`pnpm test:e2e`, `vitest.e2e.config.ts`) walks every navigation page, teams, invite drawer, policy, objective, skill create/publish/version history/search/deprecate, project create/share/tabs/repository, API key issue/revoke, metrics, audit log, phone-width navigation and sign-out/sign-in. It also fetches the UI-made skill over REST and MCP. All 24 tests run on a fresh instance in about 10 s; three are `it.fails` markers for known defects. **Done 2026-10-29:** CLI steps live in `e2e/cli.e2e.test.ts` (runs after ui-walk via `e2e/sequencer.ts`), CI job `e2e` is in `ci-gate`, and 001 landed so no manual `pnpm db:migrate`. **Left open** only for the last acceptance criterion, which stays true as each 015 fix lands; archive this item when 015 is done.

## Requirements

- [x] Covers, in order: first-run setup → create skill → publish v1 → create a team policy → create a project → grant the skill to the project → issue an API key → REST `expand` (content includes the policy) → CLI `init`, `sync`, `run` → MCP `initialize`, `tools/list`, `sh-list`, `sh-search`, `sh-run`.
- [x] Runs in a new CI job on every PR. Testcontainers unit tests stay as they are.
- [x] Fails with the step name, not a generic timeout.

## Acceptance Criteria

- [x] Reverting 014/001 makes this test fail at the setup step.
- [ ] Each 015 fix adds an assertion here.

## Technical Notes

- Playwright is already a dev dependency (`scripts/demo-ownership-transfer.mjs`).
- Click the API-key scope checkboxes; setting `.checked` directly does not update React state.
