---
epic: 008-distribution
feature: 004-usage-telemetry
status: done
dependencies: ["001-rest-api-core-routes.md"]
---

# Usage Telemetry

Port `PromptUsage` recording from the current Python `metrics_service.py`, owned by Distribution per `bcs/distribution/OWNERSHIP.md` — telemetry only, not domain state, safe to roll up or truncate without affecting any bounded context's correctness.

**Delivered** by `specs/001-usage-telemetry/` (tasks.md 25/25 complete), commit `61f6926` on `main`. `distribution.prompt_usage` (migration `0025`) records REST expand + chain-step usage; `/api/metrics` + `/metrics` page ship the aggregate view; `sh-run`'s MCP path (`002-mcp-server-and-tools.md`) already calls `recordPromptUsage` too, satisfying the transport-parity bullet ahead of schedule.

## Requirements

- [x] `distribution.prompt_usage` table: `id`, `prompt_name`, `prompt_version`, `status_code`, `latency_ms`, `created_at`
- [x] Recorded for every expansion via REST (`001-rest-api-core-routes.md`'s expand endpoint) — this is also the transport `005-skill-sync-cli.md`'s `skillcanon run` uses, so skill-sync invocations get telemetry for free with no separate wiring
- [x] If/when `002-mcp-server-and-tools.md` (currently deprioritized) is built, its `sh-run` must record the same way — parity across whichever transports actually exist, matching the parity requirement tenet C1 established for audit logging generally
- [x] Recorded for every chain step via `SkillChainRunCompleted`/`SkillChainRunFailed`/`SkillChainRunAbandoned` (renamed from the originally-planned `WorkflowRunCompleted`/`WorkflowRunFailed` — see Technical Notes)
- [x] Basic metrics endpoint/page (matching current `routers/metrics.py`) surfacing aggregate usage

## Acceptance Criteria

- [x] An expansion via REST (including via `skillcanon run`) produces a `prompt_usage` row
- [x] Metrics endpoint returns correctly org-scoped aggregates (no cross-org leakage) — independently backstopped by RLS, see `backlog/008-distribution/archive/006-distribution-tenant-isolation-tests.md`
- [x] If `002-mcp-server-and-tools.md` is later built, its `sh-run` produces an equivalent row — parity between transports verified by test at that time, not required now — confirmed done ahead of schedule (`mcp-tools.ts`'s `shRun` calls `recordPromptUsage`)

## Open Questions

- None currently.

## Dependencies

- `001-rest-api-core-routes.md`

## Technical Notes

Distinct from Audit & Compliance (epic 003) — this is telemetry for product usage/observability, not the compliance audit trail. Both exist and both matter, but they're owned by different BCs for different reasons (per `bcs/distribution/OWNERSHIP.md` vs `bcs/audit-compliance/OWNERSHIP.md`).

**Pulled forward by `006-prompt-registry/008-project-usage-metrics-dashboard.md` (design session 2026-08-01, not yet built):** that feature needs project-scoped usage attribution before this epic has otherwise started, so it will stand up the `distribution.prompt_usage` table itself with `organization_id`, `prompt_id`, `prompt_version_id`, `project_id` (nullable), `user_id` (nullable) — plus this item's own `prompt_name`/`prompt_version`/`status_code`/`latency_ms`/`created_at`. It also wires the one real recording call site that exists today (`expand()` from the prompt detail page's live preview), via a direct `distribution.recordPromptUsage(...)` function call — not a real pub/sub event, since no event-bus infrastructure exists anywhere in this codebase despite `PromptExpanded` being documented as an "event" in both BCs' `CONTRACT.md`.

This does **not** satisfy this item's requirements in full — still open and owned here once this epic actually starts: REST-layer `status_code`/`latency_ms` population (the pulled-forward direct-call path doesn't go through a REST hop yet, since `001-rest-api-core-routes.md` doesn't exist), `SkillChainRunCompleted`/`SkillChainRunFailed`/`SkillChainRunAbandoned` recording, MCP `sh-run` parity, and the generic metrics endpoint/page. Verify and extend the pulled-forward table/recording call when this epic starts rather than re-creating it from scratch.

**`WorkflowRunCompleted`/`WorkflowRunFailed` renamed and re-homed by `026-skill-chains` (design session 2026-08-01):** per [PDR-017](../../docs/pdr/017-fold-workflow-orchestration-into-prompt-registry.md), the standalone `workflow-orchestration` bounded context (and its `007-workflow-orchestration` backlog epic) was retired in favor of a "chain version" on `prompt-registry`'s own `Prompt`/`PromptVersion`. That feature's `startSkillChainRun`/`advanceSkillChainRun`/`abandonSkillChainRun` now write `skill_chain_run.completed`/`.failed`/`.abandoned` audit events (via `audit-compliance`'s `record()`) on every run's terminal transition — satisfying this item's **Audit** consumer, but explicitly **not** this item's Distribution/usage-telemetry requirement above: `distribution.recordPromptUsage` has no live caller anywhere in this codebase yet, not even from `expand()`'s own ordinary single-skill invocations (per `024-project-usage-metrics-dashboard`'s own FR-002a decision to leave that wiring unbuilt) — wiring chain-run completion into usage telemetry ahead of that would be premature. Wire this bullet in for real once `expand()`'s own usage-telemetry call site is built.
