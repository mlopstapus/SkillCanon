---
epic: 014-quickstart-reliability
feature: 001-run-migrations-in-compose
status: done
dependencies: []
---

# Run Migrations in Compose

`docker compose up -d` must leave a database the app can use.

## Requirements

- [x] `docker-compose.yaml` gains a one-shot `migrate` service built from the root `Dockerfile`'s existing `migrator` stage, using `MIGRATION_DATABASE_URL`, and `app` depends on it with `condition: service_completed_successfully`.
- [x] README's quickstart is corrected: it no longer says migrations run as part of the app's startup unless that becomes true again.
- [x] A fresh volume (`docker compose down -v && docker compose up -d`) reaches the first-run setup page and completes it with no manual step.

## Acceptance Criteria

- [x] From a clean clone with no volume, first-run setup succeeds on the first attempt.
- [x] Re-running `docker compose up -d` on an existing volume is a no-op for migrations.

## Technical Notes

- Observed failure: `/register` submit → 500, app log `28P01 password authentication failed for user "skillcanon_auth"`, because migrations `0000` and `0007` create the roles.
- The landing page redirects `/dashboard` to `/login`, not to first-run setup as the README claims, even on an empty instance. Either fix the redirect or the README.
