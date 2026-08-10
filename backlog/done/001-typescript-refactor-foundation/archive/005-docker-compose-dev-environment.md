---
epic: 001-typescript-refactor-foundation
feature: 005-docker-compose-dev-environment
status: done
dependencies: []
---

# Docker Compose Dev Environment

Update `docker-compose.yaml` so local development (and self-hosted Free-tier deployment) runs the new unified Next.js app plus Postgres, replacing the current three-service layout (`backend`, `frontend`, `database`) with the new two-service layout (`app`, `database`). This keeps the "Rebuild: `docker compose up -d`" command in CLAUDE.md accurate throughout the refactor rather than only at the very end.

## Requirements

- [x] `docker-compose.yaml` updated to build and run the unified app from `001-nextjs-app-scaffolding`'s scaffold
- [x] Postgres service configuration carries forward from the current `database/` setup — the OpenShift container-hardening behavior carries forward unchanged; the pre-baked schema init SQL (`001_schema.sql`) was deliberately dropped, since it targeted the legacy Python/Alembic schema rather than the new Drizzle-based one (resolved via `/speckit-clarify`, see `specs/005-docker-compose-dev-environment/spec.md` Clarifications and `research.md` Decision 2)
- [x] Environment variables needed for local dev documented in `.env.example` — scoped down to the database connection strings actually consumed by the app today (`DATABASE_URL`/`MIGRATION_DATABASE_URL`, already present from `002-drizzle-shared-db-kernel`); a JWT secret and self-host entitlement-bypass variable were explicitly descoped via `/speckit-clarify` since neither the `identity-access` nor `billing-entitlements` bounded contexts have any implemented logic yet — deferred to whichever future epic wires those up
- [x] `docker compose up -d` boots a working local environment: app reachable, connected to Postgres, migrations runnable — verified via `specs/005-docker-compose-dev-environment/quickstart.md` Scenarios 1–4

## Acceptance Criteria

- [x] `docker compose up -d` from a clean checkout results in the app running and reachable on the expected port (`localhost:3000`)
- [x] CLAUDE.md's "Rebuild" command entry stays accurate with no edits needed beyond this feature (the table row itself is unchanged; only the surrounding Notes prose was updated to describe what the command now runs)
- [x] Old `legacy/backend/Dockerfile` and `legacy/frontend/Dockerfile` removed once the unified app's Dockerfile replaces both

## Open Questions

- ~~Timing: does this land immediately after `001-nextjs-app-scaffolding`... or wait until more of the app is functional?~~ **Resolved**: landed immediately, per this item's own recommendation.

## Dependencies

- `001-nextjs-app-scaffolding.md`
- `002-drizzle-shared-db-kernel.md`

## Technical Notes

Per the architecture's "keep both deployment targets" decision, this only covers Docker Compose — the Helm chart update is a separate concern, tracked once `008-distribution` makes the app actually deployable end-to-end (Helm chart update isn't blocking for local dev, so it's deferred rather than included here).
