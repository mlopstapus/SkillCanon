---
epic: 000-foundations
feature: 011-fix-missing-migration-snapshot-files
status: open
dependencies: []
---

# Fix Missing Migration Snapshot Files

Discovered 2026-07-27 while building `019-account-team-settings-ui`'s schema migration: `drizzle/migrations/meta/0007_snapshot.json`, `0008_snapshot.json`, `0010_snapshot.json`, `0011_snapshot.json`, and `0013_snapshot.json` were never committed to this repo, even though their corresponding `.sql` migration files exist, are correctly named, and are already applied to every real database (confirmed via `drizzle.__drizzle_migrations`). Only `0000`–`0006`, `0009`, and (as of this feature) `0014` have snapshot files.

## Requirements

- [ ] Identify exactly which past feature/commit generated each missing snapshot without committing it (git blame the `.sql` files' introducing commits)
- [ ] Regenerate the five missing snapshot files so `drizzle/migrations/meta/` has an unbroken `0000`–`0014` (or later) sequence
- [ ] Verify `pnpm db:generate` produces a clean, minimal diff against current `schema.ts` afterward — no more phantom "catch-up" DDL bundled into unrelated future migrations

## Acceptance Criteria

- [ ] Every `.sql` file under `drizzle/migrations/` has a matching `meta/NNNN_snapshot.json`
- [ ] A test schema change (e.g. a throwaway column add/drop on a scratch branch) produces a `pnpm db:generate` diff containing only that change, not any other bounded context's already-applied DDL

## Open Questions

- None currently.

## Dependencies

- None — purely a repo-hygiene fix to existing tooling output.

## Technical Notes

Symptom: running `pnpm db:generate` after `019-account-team-settings-ui`'s `users.team_id` nullable change produced a migration re-declaring `CREATE TABLE` for `governance.objectives`, `prompt_registry.projects`/`project_members`/`prompt_versions`/`prompts` — all tables that already exist in every real database via already-applied migrations `0010`/`0012`. This happened because `drizzle-kit generate` diffs against the *latest snapshot file it can find on disk* (`0009_snapshot.json`, since `0010`–`0013`'s were missing), not against the true current schema state, silently reintroducing everything committed between `0009` and `0013` as a bogus "new" diff.

Worked around in `019-account-team-settings-ui` by keeping the auto-generated (accurate — snapshots are built from `schema.ts` directly, not from the buggy diff) `0014_snapshot.json` and hand-trimming `0014`'s `.sql` to just the real intended change. That workaround does not fix the underlying gap — the next feature to run `pnpm db:generate` after `0014` will diff correctly against `0014`'s (now real) snapshot, so the immediate bleeding has stopped, but the *historical* record for `0007`/`0008`/`0010`/`0011`/`0013` is still missing and should be backfilled for repo integrity (e.g. anyone trying to `drizzle-kit up` or inspect schema history at those specific points has no snapshot to look at).
