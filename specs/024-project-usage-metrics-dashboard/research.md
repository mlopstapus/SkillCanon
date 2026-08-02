# Phase 0 Research: Project Usage Metrics Dashboard

Most design unknowns for this feature were already resolved in a prior design conversation and the `/speckit-clarify` session (see `spec.md` Clarifications and `backlog/006-prompt-registry/008-project-usage-metrics-dashboard.md`). This document covers those briefly by reference, plus the net-new decisions made during this planning pass.

## Decisions carried in from prior sessions (reference only)

- **Decision**: Extend `distribution.prompt_usage` rather than create a new `prompt_registry`-owned usage table.
  **Rationale**: `prompt_usage` is already the documented home for invocation telemetry (`008-distribution/004-usage-telemetry.md`), and the same table `011-vcs-integration` plans to extend later with git context — avoids two BCs each independently capturing "an invocation happened."
  **Alternatives considered**: New `prompt_registry.usage_events` table — rejected, would duplicate ownership of the same concept across two bounded contexts.

- **Decision**: "Active" (skills/contributors tiles) and required-skill coverage/gaps use a rolling 30-day window; total invocations and the by-skill/by-member tables are all-time.
  **Rationale**: Keeps governance signals from becoming permanently "compliant" after one historical use; consistency across tiles.

- **Decision**: Ad hoc/personal expansions (no project context) are recorded (nullable `project_id`) but excluded from every project-scoped view.
  **Rationale**: No capture work lost for a future personal-usage view; simplest correct default.

- **Decision**: Branch/repo-level metrics are out of scope entirely for this feature.
  **Rationale**: `expand()` has no repo/branch parameters today; that data only exists once `011-vcs-integration` extends the same table.

- **Decision**: Live-preview/test invocations are never recorded as usage at all (not recorded-then-filtered).
  **Rationale**: Resolved via `/speckit-clarify` — test activity must never contribute to any metric under any circumstance; not recording it at all is simpler and safer than a filter that could be forgotten somewhere.

- **Decision**: This feature ships with every project legitimately showing "no usage yet" until `008-distribution` provides a genuine (CLI/REST/MCP) invocation transport.
  **Rationale**: Resolved via `/speckit-clarify` — accepted as a correct empty state for data that doesn't exist yet, not a partial implementation. The feature is proven correct via fixture-seeded tests, not a live end-to-end call.

## Net-new decisions made during this planning pass

### Decision: One composed cross-BC read, not five separate exposed functions

`distribution` exposes a single `getPromptUsageSummaryForProject(db, organizationId, projectId, { activeWindowDays, trendDays })` rather than five granular query functions (count, window rows, by-skill, by-member, daily trend) each separately crossing the BC boundary.

**Rationale**: Matches the established pattern of a single composed aggregate read at a BC boundary (e.g. VCS Integration's `getComplianceSummaryForProject`). `distribution` owns the SQL-level aggregation (its own table, its own optimization concern); `prompt-registry` composes the result with its own domain concepts (project members, skill requirements) that `distribution` has no reason to know about.

**Alternatives considered**: Five separate exposed functions — rejected as unnecessary surface area for what's always called together for one project.

### Decision: Bounded queries per metric, not one unbounded "fetch everything" row set

Unlike the mockup's own placeholder JS (which filters one in-memory `usageLog` array for everything), the real implementation uses targeted, bounded SQL queries:

- `countTotalForProject` — a single `COUNT(*)`, all-time (cheap regardless of table size).
- `listSinceForProject` — raw `{promptId, userId, createdAt}` rows within the 30-day active window only (bounded by the window, not all-time — powers active-skills/active-contributors counts and the per-member gap computation).
- `listGroupedBySkillForProject` / `listGroupedByMemberForProject` — `GROUP BY`, all-time (bounded by distinct skill/member count, not row count).
- `listDailyCountsBySkillForProject` — `GROUP BY` day + skill, within the 14-day trend window only.

**Rationale**: All-time invocation volume is unbounded in principle; pushing aggregation into Postgres (`GROUP BY`/`COUNT`) rather than fetching every row into the app avoids an unbounded fetch as usage grows. The 30-day and 14-day windows are naturally small regardless, so a bounded raw-row fetch is fine there. In practice, current volume is near-zero (no genuine caller exists yet — see Clarifications), so this is a correctness/hygiene choice now, not a perf fix for an existing problem.

**Alternatives considered**: Single unbounded fetch + in-process reduction (mirrors the mockup literally) — rejected as a latent scaling problem for a table with no natural row-count ceiling, even though it's harmless today.

### Decision: Tile coverage ratio is skill-level; the gap panel is member-level — two distinct computations from the same data

Re-reading the mockup's own placeholder logic (`usedRequiredIds = new Set(projUsage.filter(u => requiredIds.includes(u.promptId)).map(u => u.promptId))`, then `coverageLabel: usedRequiredIds.size + '/' + requiredIds.length`) confirms the **coverage tile** is "how many required skills were used by *anyone* in the window" (skill-level ratio), while the **gap panel** is "which specific members haven't used which specific required skills" (member-level). These are two different, complementary views over the same 30-day window rows, not the same value expressed two ways.

**Rationale**: Matches both the mockup's actual computed values and `spec.md`'s own User Story 1 Acceptance Scenario 2 ("two required skills, one used by every member... coverage tile reflects partial coverage, e.g. '1/2'" — a skill-count ratio, not a member×skill matrix).

**Alternatives considered**: A member×skill matrix ratio for the tile itself (an earlier framing from the originating backlog conversation) — superseded once the actual mockup computation was inspected; kept for the gap panel only, where member-level detail is the point.

### Decision: Display-name resolution stays in `page.tsx`, not inside `getProjectMetrics`

`getProjectMetrics` returns raw `promptId`/`userId` values; `page.tsx` maps them to names using data it already fetches (`listUsers`, the existing skill-row list), the same way it already resolves names for the Members/Prompts tabs today.

**Rationale**: Keeps `prompt-registry`'s application layer from needing to call `identity-access` just for display labels; consistent with this repo's existing convention on this exact page.

**Alternatives considered**: Resolve names inside `getProjectMetrics` — rejected, would duplicate name-resolution logic that `page.tsx` already owns.
