# Quickstart: Policy Model & CRUD

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Run the focused Governance policy tests:

   ```sh
   pnpm vitest run src/bcs/governance/application/*.test.ts
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
- Invalid create scopes (both scope ids, neither scope id, wrong-org scope) throw and persist no policy/audit row.
- Successful create/update/deactivate writes exactly one audit event with `resource_type = 'policy'`.
- Cross-org get/update/delete treats another organization's policy as not found.
- Team/project list operations return only active rows ordered by `priority desc`.
