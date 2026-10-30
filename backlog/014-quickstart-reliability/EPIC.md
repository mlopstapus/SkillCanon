# Epic 014: Quickstart Reliability

**Priority:** 1
**Status:** in-progress
**Goal:** A new user can go from `git clone` to a skill fetched over REST, the CLI and MCP without reading source code, and CI proves it on every merge.

## Overview

A local smoke test on 2026-10-29 (commit `389315d`) followed the README exactly. `docker compose up -d` starts the app on an empty database: no schemas, no `skillcanon_app`/`skillcanon_auth` roles. The first-run setup page then fails with a 500 (`password authentication failed for user "skillcanon_auth"`). The README says migrations run on startup. They did before the Helm rework moved them into a migration job, and Compose never got a replacement. After a manual `pnpm db:migrate`, the whole flow worked.

Typecheck, lint, the CLI suite and the Testcontainers suite were all green at that commit. None of them exercises the path a new user takes, which is why this epic comes first.

## Features

- [x] [001 - Run Migrations in Compose](archive/001-run-migrations-in-compose.md)
- [x] [002 - End-to-End Smoke Test](archive/002-end-to-end-smoke-test.md)
- [ ] [003 - Installable CLI](003-installable-cli.md)
- [x] [004 - Move pnpm Settings Out of package.json](archive/004-pnpm-settings.md)

_Completed features are moved to `archive/` and checked off here._

## Dependencies

None. Everything it touches is done.

## Notes

- Do this before 015: 002's smoke test is the regression net for the 015 fixes.
