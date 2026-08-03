# Quickstart: Verify Migration Snapshot Repair

1. Confirm SQL-to-snapshot parity:

   ```bash
   comm -23 \
     <(find drizzle/migrations -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]_*.sql' -printf '%f
' | sed 's/_.*//' | sort) \
     <(find drizzle/migrations/meta -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]_snapshot.json' -printf '%f
' | sed 's/_snapshot\.json//' | sort)
   ```

   Expected output: no lines.

2. Run baseline generation:

   ```bash
   pnpm db:generate
   ```

   Expected result: no already-applied historical DDL is produced.

3. Make a temporary schema-only change in a Drizzle schema file.

4. Run generation again:

   ```bash
   pnpm db:generate
   ```

   Expected result: generated SQL contains only the temporary schema change.

5. Revert the temporary schema edit and remove the generated verification migration files.

6. Confirm the final diff contains only restored snapshot metadata and Spec Kit documentation:

   ```bash
   git diff --stat
   ```
