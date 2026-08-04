---
epic: 012-ai-and-mcp-governance-tools
feature: 003-objective-summarization-and-aggregation
status: open
dependencies: ["backlog/005-governance/EPIC.md", "backlog/009-billing-entitlements/EPIC.md", "backlog/012-ai-and-mcp-governance-tools/001-admin-and-metrics-mcp-tools.md"]
---

# Objective Summarization & Aggregation

Placeholder for a paid-tier feature that uses AI to automatically summarize an objective (or a group of them) and to roll up/aggregate many objectives into a higher-level view of what an org or team is actually driving toward. Captured for later scoping — not yet designed in any detail.

## Requirements

- [ ] Not yet scoped — see Open Questions

## Acceptance Criteria

- [ ] Not yet scoped — see Open Questions

## Open Questions

- Summarization of what, exactly — an objective's own text/history, or objective text plus related activity (audit events, skill usage)?
- Aggregation scope: per-team, per-org, or org-wide across teams? Does this respect the same tenant isolation guarantees as everything else, or is it inherently a cross-team rollup a team member shouldn't be able to trigger for teams they don't belong to?
- Is the output cached/regenerated on a schedule, or computed live on request? (Cost and staleness tradeoff — a live LLM call per page view is expensive; a cached summary can go stale as objectives change.)
- Which LLM/provider, and how is usage cost attributed per-org for billing purposes?
- Does this overlap with `003-audit-compliance`'s existing usage/audit data in a way that should reuse its query paths rather than duplicating them?
- Should this be exposed as an MCP tool (feature `001`) too, so an external AI client can pull the same aggregate view, or is it in-app-only?

## Dependencies

- `backlog/005-governance/002-objective-model-and-crud.md`
- `backlog/009-billing-entitlements/EPIC.md` (paid-tier gating)
- `backlog/012-ai-and-mcp-governance-tools/001-admin-and-metrics-mcp-tools.md` (likely shares underlying read/aggregate functions — see Technical Notes)

## Technical Notes

Deliberately unscoped. Consider whether this shares an LLM-provider/cost-attribution decision with `002-ai-policy-and-tenet-interview-assistant.md` rather than each feature choosing independently.
