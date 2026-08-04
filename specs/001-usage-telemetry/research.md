# Research: Usage Telemetry

## Decision: Extend `distribution.prompt_usage` rather than create a new table

**Rationale**: Feature 024 already established `distribution.prompt_usage` and Distribution ownership. Extending that table with nullable runtime fields (`status_code`, `latency_ms`, optional git context) preserves the existing project metrics dashboard and avoids parallel usage sources.

**Alternatives considered**: A separate `usage_events` table was rejected because it would duplicate organization/skill/version/project/user attribution and force every metrics reader to merge two usage sources.

## Decision: Record REST expand telemetry at the route boundary

**Rationale**: `prompt-registry.expand()` is also used by preview/test and skill-chain internal resolution. Recording inside `expand()` would violate FR-002 by counting authoring previews. The authenticated REST route is the genuine Distribution external surface and has caller, project, user, status, and elapsed-time context.

**Alternatives considered**: Recording in the prompt-registry service was rejected because it cannot distinguish genuine REST/CLI usage from preview/test invocations.

## Decision: Resolve prompt/version metadata before expansion for REST telemetry

**Rationale**: `expand()` currently returns rendered messages only. The route can use `fetchExpandableVersion()` before calling `expand()` to know whether a genuine invocation reached a visible skill/version and to record success/failure without changing the response contract.

**Alternatives considered**: Adding prompt/version IDs to `ExpansionResult` was rejected as unnecessary response-surface churn for a route that can resolve the same version at the boundary.

## Decision: Record chain telemetry for accepted terminal step reports in the advance route

**Rationale**: The pending step row being reported already contains the resolved skill identity/version string and the caller route has organization/user context. Recording in `src/app/api/chain-runs/[runId]/advance/route.ts` after a successful `advanceSkillChainRun()` call captures completed/failed step outcomes without fabricating abandoned/unreported steps.

**Alternatives considered**: Recording inside prompt-registry would introduce a dependency from prompt-registry into Distribution and blur BC ownership. Recording on start would count unresolved or unreported steps, violating FR-007.

## Decision: Add an organization-level summary service and `/api/metrics`

**Rationale**: Project metrics remain project-scoped. This feature requires org-scoped aggregate usage independent of any one project, including totals, skill/version/status breakdowns, and latency summaries for a bounded window.

**Alternatives considered**: Reusing `/api/projects/{id}/metrics` was rejected because it cannot represent ad hoc usage, cross-project totals, or organization-level zero-state.

## Decision: Use `coreFeaturesEnabled` for the new metrics API/page gate

**Rationale**: The entitlement catalog defines `coreFeaturesEnabled` as the universal gate for features enabled on both Free and Paid tiers. The app-shell page already runs the gate; the API route must explicitly assert it before doing work.

**Alternatives considered**: Adding a telemetry-specific entitlement was rejected because the feature is part of the self-hosted Free external surface and no packaging distinction is specified.
