# Quickstart: Prompt Registry Tenant Isolation Tests

## Prerequisites

- Node.js >=24
- Docker available for Testcontainers PostgreSQL
- Dependencies installed with `pnpm install`

## Validate

1. Run the focused tenant isolation test:

   ```sh
   pnpm test src/bcs/prompt-registry/application/tenant-isolation.test.ts
   ```

2. Run the full finish pipeline:

   ```sh
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

## Expected Result

- Cross-organization reads by exact id resolve empty through app-layer services and direct unfiltered queries, for all six resource types (`projects`, `project_teams`, `prompts`, `prompt_versions`, `subscriptions`, `project_skill_assignments`).
- Cross-organization writes by exact id affect zero rows through app-layer services (where an app-layer write path exists) and direct unfiltered updates/inserts, for all six resource types.
- `src/bcs/prompt-registry/application/query-audit.md` records zero remaining feature-001/002/003/007 service queries without an `organization_id` filter.
