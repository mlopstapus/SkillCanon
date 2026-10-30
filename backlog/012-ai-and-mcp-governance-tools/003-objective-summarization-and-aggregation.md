---
epic: 012-ai-and-mcp-governance-tools
feature: 003-objective-summarization-and-aggregation
status: open
dependencies: ["backlog/005-governance/EPIC.md", "backlog/009-billing-entitlements/EPIC.md", "backlog/012-ai-and-mcp-governance-tools/001-admin-and-metrics-mcp-tools.md"]
---

# Objective Summarization & Aggregation

Placeholder for a paid-tier feature that uses AI to automatically summarize an objective (or a group of them) and to roll up/aggregate many objectives into a higher-level view of what an org or team is actually driving toward. Captured for later scoping — not yet designed in any detail.

## Requirements

- [x] Summary box on a team's Objectives tab: summarize the team's effective objectives, or (admin) the whole org (spec `specs/047-objective-summary`). Cached by input hash, process-local (no migration). (#122)
- [x] Read-only MCP tool `sh-admin-objective-summary` (governance:read; returns the cached summary only, never calls a model). (#122)

## Acceptance Criteria

- [x] Repeat requests with unchanged objectives make no model call; a change makes a new one. (#122)
- [x] Org rollup is admin-only; no opt-in or no provider gives a clear refusal and no model call. (#122)
- [ ] Verified live against a real provider — **needs Ben** (provider key in the admin page, org opted in).

## Open Questions

- Summarization of what, exactly — an objective's own text/history, or objective text plus related activity (audit events, skill usage)?
- Aggregation scope: per-team, per-org, or org-wide across teams? Does this respect the same tenant isolation guarantees as everything else, or is it inherently a cross-team rollup a team member shouldn't be able to trigger for teams they don't belong to?
- Is the output cached/regenerated on a schedule, or computed live on request? (Cost and staleness tradeoff — a live LLM call per page view is expensive; a cached summary can go stale as objectives change.)
- Which LLM/provider, and how is usage cost attributed per-org for billing purposes?
- Does this overlap with `003-audit-compliance`'s existing usage/audit data in a way that should reuse its query paths rather than duplicating them?
- Should this be exposed as an MCP tool (feature `001`) too, so an external AI client can pull the same aggregate view, or is it in-app-only?

## Questions for Ben (wave 5) — building to these defaults

1. Input: **default** objective titles and descriptions only (no audit or usage data).
2. Scope: **default** per team (its effective objectives), plus an org-wide rollup for admins only; always through the caller's tenant context.
3. Freshness: **default** cached in a table keyed by a hash of the input objectives, regenerated on demand when the hash changes; never a model call per page view.
4. Provider, opt-in and cost: **default** same as 002.
5. MCP: **default** also a read-only `sh-admin-objective-summary` tool, returning the cached summary only.

## Dependencies

- `backlog/005-governance/002-objective-model-and-crud.md`
- `backlog/009-billing-entitlements/EPIC.md` (paid-tier gating)
- `backlog/012-ai-and-mcp-governance-tools/001-admin-and-metrics-mcp-tools.md` (likely shares underlying read/aggregate functions — see Technical Notes)

## Technical Notes

Deliberately unscoped. Consider whether this shares an LLM-provider/cost-attribution decision with `002-ai-policy-and-tenet-interview-assistant.md` rather than each feature choosing independently.
