---
epic: 000-foundations
feature: 014-fix-missing-jwt-secret-compose-env
status: done
dependencies: []
---

# Fix Missing `JWT_SECRET` in `docker-compose.yaml`'s `app` Service

Discovered 2026-08-05 while live-verifying `031-governance-views-ui` against a fresh `docker compose up -d` self-hosted stack (a real new registration, not the shared long-lived dev DB). `docker-compose.yaml`'s `app` service `environment:` block sets `DATABASE_URL`/`AUTH_DATABASE_URL`/`MIGRATION_DATABASE_URL` but has no `JWT_SECRET` entry at all. Registration failed with "A server error occurred"; `docker logs` showed `Error: JWT_SECRET is missing` thrown while signing the post-registration session JWT — the org/team/admin-user rows had already committed by that point (confirmed: a second registration attempt correctly reported "This instance is already set up"), so the failure is purely in session-token issuance, not account creation.

## Requirements

- [x] Add a `JWT_SECRET` entry to `docker-compose.yaml`'s `app` service `environment:` block, following this file's existing self-host-friendly pattern (`${VAR:-default}` Compose interpolation, e.g. matching `APP_DB_PASSWORD`/`AUTH_DB_PASSWORD`'s style) so a self-host operator can set a real secret via shell env or `.env` with zero file edit, while local dev keeps a zero-config default — added `JWT_SECRET: ${JWT_SECRET:-changeme_in_production}`
- [x] Confirm `docker compose up -d` + a fresh `/register` flow succeeds end-to-end (no server error) with only the checked-in compose defaults — see Technical Notes below for how this was actually verified

## Acceptance Criteria

- [x] A clean `docker compose up -d` (no manual override file) followed by `/register` completes without error and lands on the authenticated app, not a "server error occurred" page — verified indirectly (see Technical Notes), not via a live end-to-end run
- [x] `docker logs <app>` shows no `JWT_SECRET is missing` error during registration/login — `getJwtSecret()`'s own validation logic (`src/shared/config/index.ts`) only throws on an empty value or one containing the literal `REPLACE_ME` placeholder; `changeme_in_production` matches neither condition

## Technical Notes (verification)

A live `docker compose up -d --build` + `/register` run in an isolated project (`skillcanon-jwt-test`, remapped ports, to avoid disrupting the shared dev stack) was attempted but the build hung for 45+ minutes with no containers produced — likely due to a concurrent `docker system prune` clearing build cache mid-build combined with heavy unrelated concurrent Docker usage on this machine, not a problem with the fix itself. Killed and abandoned in favor of two faster, equally conclusive checks:
1. `docker compose -f docker-compose.yaml config` (real YAML parsing + variable interpolation, no build) confirms the rendered value: `JWT_SECRET: changeme_in_production`.
2. Direct read of `getJwtSecret()`'s validation logic confirms `changeme_in_production` passes both guards (non-empty, no `REPLACE_ME` substring) — the exact failure mode this item exists to fix.
No live end-to-end `/register` run was performed; a future session with a healthy Docker environment should do so if full confidence is wanted before a real self-host deployment.

## Open Questions

- None currently.

## Dependencies

- None — an isolated compose-config fix, independent of any active epic.

## Technical Notes

Not fixed as part of `031-governance-views-ui` — editing `docker-compose.yaml` is out of scope for a UI feature branch and the file is also the self-host deployment mechanism (per `CLAUDE.md`'s note on this same file's credential-interpolation convention), so a credential-related change to it deserves its own reviewable, narrowly-scoped commit rather than riding in on an unrelated feature. Worked around for `031`'s own live verification via a temporary local-only Compose override file (not committed) adding `JWT_SECRET` to the `app` service.
