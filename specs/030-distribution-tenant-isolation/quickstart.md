# Quickstart: Distribution Tenant Isolation Tests

## Prerequisites

- Node.js >=24
- Docker available for Testcontainers PostgreSQL
- Dependencies installed with `pnpm install`

## Validate

1. Run the focused tenant isolation test:

   ```sh
   pnpm test src/bcs/distribution/application/tenant-isolation.test.ts
   ```

2. Run the rest of the Distribution bounded context's existing tests, to confirm the new RLS migration doesn't regress already-passing coverage:

   ```sh
   pnpm test src/bcs/distribution
   ```

3. Run the full finish pipeline:

   ```sh
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

## Expected Result

- Cross-organization reads of a `distribution.prompt_usage` row by exact id, through a direct unfiltered query, resolve empty.
- Cross-organization writes (update, delete) by exact id, through a direct unfiltered query, affect zero rows.
- A real `recordPromptUsage()` call whose `organizationId` argument disagrees with the session's tenant context is denied.
- `src/bcs/distribution/application/query-audit.md` records zero remaining Distribution service queries against `distribution.prompt_usage` without an `organization_id` filter.
