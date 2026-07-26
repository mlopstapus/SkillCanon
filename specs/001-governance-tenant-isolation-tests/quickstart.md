# Quickstart: Governance Tenant Isolation Tests

## Prerequisites

- Node.js >=24
- Docker available for Testcontainers PostgreSQL
- Dependencies installed with `pnpm install`

## Validate

1. Run the focused tenant isolation test:

   ```sh
   pnpm test src/bcs/governance/application/tenant-isolation.test.ts
   ```

2. Run the full finish pipeline:

   ```sh
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

## Expected Result

- Cross-organization reads by exact policy/objective id resolve empty through app-layer services and direct unfiltered queries.
- Cross-organization writes by exact policy/objective id affect zero rows through app-layer services and direct unfiltered updates/deletes.
- `src/bcs/governance/application/query-audit.md` records zero remaining policy/objective service queries without an `organization_id` filter.
