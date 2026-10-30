# Feature Specification: Objective Summarization & Aggregation

**Feature**: `047-objective-summary` · **Backlog**: `backlog/012-ai-and-mcp-governance-tools/003-objective-summarization-and-aggregation.md` · **Depends on**: #109 (provider pool, opt-in) and #121 (012/002, same page and opt-in errors).

## User Scenarios
- **US1** On a team's Objectives tab, a member clicks "Summarize this team" and gets a short plain-text summary of that team's effective objectives (its own plus inherited).
- **US2** An admin clicks "Summarize organization" and gets a rollup across every team. A non-admin gets a refusal and no model call.
- **US3** Asking again with unchanged objectives returns the same summary without calling the model; changing an objective produces a new summary.

## Requirements
- **FR-001** Input is objective titles and descriptions only.
- **FR-002** Team scope uses the caller's effective objectives through their tenant context; org scope is admin-only.
- **FR-003** Summaries are cached by a hash of the input; the model is called only on a cache miss.
- **FR-004** Uses the eval provider pool and the per-org eval opt-in; refuses with a clear message otherwise.
- **FR-005** Token usage per call is logged with org and user.
- **FR-006** No objectives: reply "No objectives to summarize." with no model call.

## Assumptions
- The cache is process-local (no migration); it is lost on restart. Upgrade to a table if summaries must persist.
- The read-only MCP tool from the backlog defaults is a follow-up: it belongs next to #110's admin tools, which are unmerged.
