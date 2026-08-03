# Data Model: Migration Snapshot Repair

## Migration SQL File

**Path**: `drizzle/migrations/NNNN_name.sql`

**Fields**:

- `number`: four-digit migration prefix, unique within `drizzle/migrations/`
- `name`: descriptive migration suffix
- `body`: historical SQL transition, already applied to real databases

**Validation rules**:

- Every SQL file must have exactly one matching `drizzle/migrations/meta/NNNN_snapshot.json`.
- Historical SQL bodies must not change as part of this repair.

## Migration Snapshot File

**Path**: `drizzle/migrations/meta/NNNN_snapshot.json`

**Fields**:

- `version`: Drizzle snapshot format version
- `dialect`: `postgresql`
- `schemas`: schema names known after the migration
- `tables`: table definitions known after the migration
- `enums`, `sequences`, `views`, `policies`, `roles`: additional PostgreSQL metadata buckets used by Drizzle

**Validation rules**:

- The snapshot number must match a SQL migration prefix.
- The snapshot must represent schema state after its corresponding SQL migration is applied in order.
- Restored snapshots for this feature are `0007`, `0008`, `0010`, `0011`, `0012`, and `0013`.

## Migration Journal

**Path**: `drizzle/migrations/meta/_journal.json`

**Fields**:

- `entries`: ordered Drizzle migration tags and breakpoints

**Validation rules**:

- Existing order must remain unchanged.
- Journal entries for restored snapshot numbers must already exist; this repair does not add new SQL migrations.

## Verification Schema Change

**Path**: current Drizzle schema source under `src/shared/db/schemas.ts` or `src/bcs/*/infrastructure/schema.ts`

**Fields**:

- A temporary, minimal schema edit used only to prove `pnpm db:generate` emits a minimal new migration.

**Validation rules**:

- Must be reverted before final commit.
- Any generated migration SQL, snapshot, and journal changes from the verification must be removed before final commit.
