---
epic: 008-distribution
feature: 006-distribution-tenant-isolation-tests
status: done
dependencies: ["../006-prompt-registry/008-project-usage-metrics-dashboard.md"]
---

# Distribution Tenant Isolation Tests

Apply Postgres RLS to `distribution.prompt_usage` (and any other `distribution`-schema table added by the time this epic starts), per tenets M1/M2/M3. Flagged during `024-project-usage-metrics-dashboard`'s implementation (plan.md Complexity Tracking item 2): that feature created `distribution.prompt_usage` — the first table in this schema — without RLS, matching `prompt_registry`'s own established precedent of shipping without RLS and deferring it to a dedicated feature (see `backlog/006-prompt-registry/archive/005-prompt-registry-tenant-isolation-tests.md`). Application-layer `organizationId`/`projectId` scoping is `024`'s sole current control, verified by tests but with no independent RLS backstop.

**Delivered** by `specs/030-distribution-tenant-isolation/` (tasks.md 22/22 complete), migration `0026_distribution_rls.sql`, `src/bcs/distribution/application/tenant-isolation.test.ts`, merged via PR #61. `distribution.prompt_usage` remained the only table in the schema at implementation time.

## Requirements

- [x] RLS policies enabled on `distribution.prompt_usage` and every other table this schema accumulates by the time this feature is built
- [x] Every existing query against these tables (recordPromptUsage, getPromptUsageSummaryForProject, and whatever `008-distribution`'s own core features add) already filters by `organization_id` — audit against this feature, don't assume
- [x] M3 negative test per resource type: a user in org A cannot read or write org B's usage rows by any query path

## Acceptance Criteria

- [x] Cross-org access is denied for `distribution.prompt_usage`, proven by test
- [x] RLS independently blocks cross-org access with the app-layer filter simulated as absent

## Open Questions

- Whether this should be one shared feature covering every `distribution` table, or split per-table as the schema grows — deferred until this epic actually starts and the real table set is known.

## Dependencies

- `backlog/006-prompt-registry/008-project-usage-metrics-dashboard.md` (created `distribution.prompt_usage` without RLS; this feature closes that gap)
- `backlog/002-identity-access/007-tenant-isolation-tests-and-rls.md` (shared cross-tenant-denial test helper pattern)

## Technical Notes

Reuses the shared test helper from epic 002, same as `prompt_registry`'s own tenant-isolation feature. `024-project-usage-metrics-dashboard`'s application-layer tests (`get-prompt-usage-summary-for-project.test.ts`) already include a negative cross-org test as a stopgap — this feature adds the independent RLS backstop, it doesn't invent the isolation requirement from scratch.
