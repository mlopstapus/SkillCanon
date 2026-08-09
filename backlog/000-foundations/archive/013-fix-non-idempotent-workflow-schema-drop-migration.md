---
epic: 000-foundations
feature: 013-fix-non-idempotent-workflow-schema-drop-migration
status: done
dependencies: []
---

# Fix Non-Idempotent `DROP TABLE "workflow"."workflows"` Migration

Discovered 2026-08-02 while live-verifying `027-skill-chain-views-ui` against the long-lived shared local dev database (`docker-compose.yaml`'s `database` service, up several days). `drizzle/migrations/0024_drop_workflow_schema.sql` (from `026-skill-chains`'s retirement of the standalone `workflow-orchestration` bounded context) contains:

```sql
DROP TABLE "workflow"."workflows" CASCADE;
```

with no `IF EXISTS`. On any database whose history never actually created `workflow.workflows` in the first place (e.g. a dev DB provisioned or last-migrated at a point where that table was never applied), `pnpm db:migrate` fails outright with `PostgresError: table "workflows" does not exist (42P01)` — blocking every migration after it, including anything genuinely new for a future feature that hasn't been touched at all.

## Requirements

- [x] Add `IF EXISTS` to the `DROP TABLE` (and any sibling `DROP SCHEMA`/`DROP TYPE` statements in the same migration file, if present) so the migration is idempotent regardless of whether `workflow.*` was ever actually created on the target database — both `DROP TABLE` and `DROP SCHEMA` in `0024_drop_workflow_schema.sql` now use `IF EXISTS`
- [x] Confirm `pnpm db:migrate` succeeds from a clean database (never had `workflow.*`) and also from a database that did have it (the originally-intended case), both ending in the same schema state

## Acceptance Criteria

- [x] `pnpm db:migrate` against a fresh, empty database completes without error through the latest migration — verified against a throwaway isolated Postgres container; directly confirmed `DROP TABLE IF EXISTS "workflow"."workflows" CASCADE; DROP SCHEMA IF EXISTS "workflow";` succeeds with no error (`NOTICE: schema "workflow" does not exist, skipping`) on a database that never had it
- [x] `pnpm db:migrate` against a database that still has `workflow.workflows` (simulating an install migrated before `0024`) also completes without error and drops the table as originally intended — a full fresh-DB migration run creates `workflow.workflows` (via the earlier migration that originally added it) then drops it via `0024` in the same run; confirmed the `workflow` schema is gone afterward

## Open Questions

- None currently.

## Dependencies

- None — a migration-hygiene fix, independent of any active epic. Safe to apply regardless of which epic is currently in progress, since it only relaxes an existing `DROP` to be idempotent; it doesn't change the resulting schema.

## Technical Notes

Not fixed as part of `027-skill-chain-views-ui` — editing an already-committed, already-applied-elsewhere migration file is out of scope for a UI feature and carries its own blast radius (per this repo's convention, migrations are treated as immutable history once merged). Worked around for `027`'s own live verification by treating this specific dev database's migration state as unrelated/pre-existing and verifying via the Testcontainers-backed test suite (which provisions a fresh database per run and therefore never hits this path) instead of the blocked shared dev DB.
