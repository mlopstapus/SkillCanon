# Research: Fix Missing Migration Snapshot Files

## Decision: Restore snapshot parity without editing historical SQL or journal ordering

**Rationale**: The SQL migrations are already applied to real databases and the journal already records their sequence. The repair is metadata parity: add the missing `meta/NNNN_snapshot.json` files so Drizzle has an uninterrupted schema history.

**Alternatives considered**:

- Rewrite or squash migrations: rejected because historical migrations are already applied.
- Regenerate a new latest migration only: rejected because `drizzle-kit generate` would still diff from incomplete historical snapshots.

## Decision: Include `0012_snapshot.json` in addition to the five issue-named files

**Rationale**: The acceptance criterion is every SQL migration has a matching snapshot. Repository inspection shows `0012_prompt_registry_projects.sql` also lacks `meta/0012_snapshot.json`, so excluding it would leave snapshot parity broken.

**Alternatives considered**:

- Repair only the issue-named five files: rejected because it would fail FR-001 and SC-001.

## Decision: Use SQL-introducing commits as provenance evidence

**Rationale**: Each restored snapshot must be reviewable against the historical migration it represents. `git log --diff-filter=A -- drizzle/migrations/NNNN_*.sql` identifies the commit that first added each SQL file.

**Provenance**:

- `0007_identity_access_rls.sql`: `10503ae25d88e9e2cbcc5dd15e7ec829302b0cde` - `feat(identity-access): enable Postgres RLS across identity_access tables`
- `0008_audit_transport_source.sql`: `61f99a0e57dcedfad7bb26f493a41bb09269be5a` - `feat(audit): retrofit identity mutations`
- `0010_governance_objectives.sql`: `7b597e41fa2badce4693085f4d23e00b3089a1e0` - `feat(governance): add objective CRUD model`
- `0011_governance_rls.sql`: `cfc2ded7072655d8b024be52095e23707b769e29` - `feat(governance): enforce tenant isolation with RLS`
- `0012_prompt_registry_projects.sql`: `6f207403e68f568b927a120435f5013b73ae275a` - `feat(prompt-registry): add project model and membership`
- `0013_prompt_registry_prompts.sql`: `b94f9fac689e685b368e4a20ebcdf89724414639` - `feat(prompt-registry): add org-scoped Prompt & Version model`

**Alternatives considered**:

- Infer provenance from journal order only: rejected because it would not identify the source commit for reviewer audit.

## Decision: Verify with a temporary schema change and remove all verification artifacts

**Rationale**: A clean baseline generation can produce no new migration when current schema and latest snapshot align, but the acceptance criteria also require proving a future schema edit produces only its intended DDL. The verification must therefore create a temporary schema edit, run `pnpm db:generate`, inspect the generated SQL, and revert the schema edit plus generated migration files before final handoff.

**Alternatives considered**:

- Stop after file parity: rejected because it does not prove future generation behavior.
- Commit a generated verification migration: rejected because SC-004 requires no temporary verification artifacts in the final diff.
