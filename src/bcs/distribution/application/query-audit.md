# Distribution Query Audit

Scope: `030-distribution-tenant-isolation`, covering every service-layer query against `distribution.prompt_usage`: `recordPromptUsage`, `getPromptUsageSummaryForProject`, and `getPromptUsageSummaryForOrganization` (including each function's internal repository reads). Audit date: 2026-08-03.

## Result

Zero remaining Distribution service queries against `distribution.prompt_usage` target tenant-scoped rows without filtering by the caller's `organizationId`. No fix was required.

## `recordPromptUsage`

| File | Query path | Tenant filter result |
| ---- | ---------- | -------------------- |
| `src/bcs/distribution/application/record-prompt-usage.ts` | `recordPromptUsage()` delegates directly to `insert()`. | Pass |
| `src/bcs/distribution/infrastructure/prompt-usage-repo.ts` | `insert()` writes `organizationId: params.organizationId` as a required column on every row (RLS's `WITH CHECK` now independently rejects a write whose `organizationId` disagrees with the session's tenant context — proven by `tenant-isolation.test.ts`). | Pass |

## `getPromptUsageSummaryForProject`

| File | Query path | Tenant filter result |
| ---- | ---------- | -------------------- |
| `src/bcs/distribution/application/get-prompt-usage-summary-for-project.ts` | Composes `countTotalForProject`, `listSinceForProject`, `listGroupedBySkillForProject`, `listGroupedByMemberForProject`, `listDailyCountsBySkillForProject`, passing `organizationId`/`projectId` to each. | Pass |
| `src/bcs/distribution/infrastructure/prompt-usage-repo.ts` | `countTotalForProject()`, `listSinceForProject()`, `listGroupedBySkillForProject()`, `listGroupedByMemberForProject()`, `listDailyCountsBySkillForProject()` all include `eq(promptUsage.organizationId, organizationId)` (`and()`-combined with the `projectId` filter). | Pass |

Existing app-layer cross-org-exclusion coverage: `get-prompt-usage-summary-for-project.test.ts`'s "never returns another organization's usage rows, even given the same projectId" test.

## `getPromptUsageSummaryForOrganization`

| File | Query path | Tenant filter result |
| ---- | ---------- | -------------------- |
| `src/bcs/distribution/application/get-prompt-usage-summary-for-organization.ts` | Delegates to `listForOrganizationWindow(db, organizationId, from, to)`. | Pass |
| `src/bcs/distribution/infrastructure/prompt-usage-repo.ts` | `listForOrganizationWindow()` includes `eq(promptUsage.organizationId, organizationId)` (`and()`-combined with the window bounds). | Pass |

Existing app-layer cross-org-exclusion coverage: `get-prompt-usage-summary-for-organization.test.ts`'s "aggregates status, skill/version, latency, and day within the requested organization" test (seeds a row under `otherOrgId` and asserts it's excluded).

## REST route callers

| File | Query path | Tenant filter result |
| ---- | ---------- | -------------------- |
| `src/app/api/skills/[name]/expand/route.ts` | Both `recordPromptUsage()` calls (success and error branches) run inside `withTenantContext(db, caller.organizationId, ...)` and pass `organizationId: caller.organizationId`. | Pass |
| `src/app/api/chain-runs/[runId]/advance/route.ts` | `recordPromptUsage()` runs inside `withTenantContext(db, caller.organizationId, ...)` and passes `organizationId: caller.organizationId`. | Pass |
| `src/app/api/metrics/route.ts` | `getPromptUsageSummaryForOrganization()` runs inside `withTenantContext(db, caller.organizationId, ...)` and passes `caller.organizationId`. | Pass |
| `src/bcs/distribution/application/mcp-tools.ts` (`shRun`, the deprioritized MCP `sh-run` tool) | `recordPromptUsage(auditTx, ...)` runs nested inside `withTenantContext(ctx.db, ctx.caller.user.orgId, ...)` → `withAudit(tx, ...)`, and passes `organizationId: ctx.caller.user.orgId`. | Pass |

## Fixture bug found and fixed (not a production gap)

`src/bcs/prompt-registry/application/get-project-metrics.test.ts` called `recordPromptUsage(testDb.appDb, {...})` directly, unwrapped in `withTenantContext` — this predates RLS on `distribution.prompt_usage` and worked only because no tenant-context enforcement existed yet. Enabling RLS in this feature correctly broke it (`current_setting('app.current_org_id')` unset → insert denied). Fixed by wrapping every `recordPromptUsage` call in that file in `withTenantContext(testDb.appDb, fixture.organizationId, ...)`, matching every other caller in the codebase. This is a test-fixture fix, not a production `organizationId`-filtering gap — `recordPromptUsage`'s own implementation was never missing the filter.
