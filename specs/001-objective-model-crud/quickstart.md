# Quickstart: Objective Model & CRUD

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Run the focused Governance objective tests:

   ```sh
   pnpm vitest run src/bcs/governance/application/*objective*.test.ts
   ```

3. Generate and apply database migrations in local development:

   ```sh
   pnpm db:generate
   pnpm db:migrate
   ```

4. Run the full validation set:

   ```sh
   pnpm test
   pnpm run typecheck
   pnpm run lint
   ```

Expected checks:
- Organization-only, team, project, user, and multi-scope create operations persist objective rows with default `status = 'active'` and `isInherited = false`.
- Invalid create/update scope references, cross-org parent references, and cycle-forming parent links throw and persist no objective/audit row.
- Successful create/update/delete writes exactly one audit event with `resource_type = 'objective'`.
- Cross-org get/update/delete treats another organization's objective as not found.
- Team/project/user list operations return only active rows ordered by `created_at asc`.
