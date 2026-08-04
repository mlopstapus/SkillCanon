---
epic: 012-ai-and-mcp-governance-tools
feature: 002-ai-policy-and-tenet-interview-assistant
status: open
dependencies: ["backlog/005-governance/EPIC.md", "backlog/009-billing-entitlements/EPIC.md", "backlog/012-ai-and-mcp-governance-tools/001-admin-and-metrics-mcp-tools.md"]
---

# AI Policy & Tenet Interview Assistant

Placeholder for a paid-tier feature that helps a team turn a loose, conversational description of their goals and constraints into concrete draft policies/tenets, via an AI-driven interview flow rather than requiring them to write governance rules from scratch. Captured for later scoping — not yet designed in any detail.

## Requirements

- [ ] Not yet scoped — see Open Questions

## Acceptance Criteria

- [ ] Not yet scoped — see Open Questions

## Open Questions

- What does "interview" mean concretely — a multi-turn chat UI, a structured questionnaire the AI fills in conversationally, or something else?
- Does the assistant propose policies/objectives directly as drafts a human then approves/edits, or does it only ever produce suggestions in a side panel? (Governance mistakes are silent per `005-governance`'s own risk framing — auto-applying AI-authored policy without a human approval step seems risky and should be a deliberate decision, not a default.)
- Which LLM/provider, and how is usage cost attributed per-org for billing purposes?
- Does this reuse any of `prompt-registry`'s template/expansion machinery, or is it a fully separate code path?
- How does this interact with the hierarchical resolution engine (`005-governance/003-hierarchical-resolution-engine.md`) — does the assistant need to be aware of inherited team/org policies to avoid proposing conflicting or redundant ones?
- Should "propose/apply a policy" call the same underlying application-layer function that feature `001`'s MCP tools wrap, so an external AI client (via MCP) and this in-app assistant enforce identical rules instead of two independently-maintained code paths?

## Dependencies

- `backlog/005-governance/001-policy-model-and-crud.md`
- `backlog/005-governance/002-objective-model-and-crud.md`
- `backlog/009-billing-entitlements/EPIC.md` (paid-tier gating)
- `backlog/012-ai-and-mcp-governance-tools/001-admin-and-metrics-mcp-tools.md` (likely shares underlying governance-mutation functions — see Technical Notes)

## Technical Notes

Deliberately unscoped. This is the first feature in this codebase to call an LLM at all — worth an explicit architecture/PDR pass on provider choice, cost model, and safety (human approval before any AI-authored policy takes effect) before writing real requirements. Whichever of feature `001` or this feature is built first should own the underlying read/mutate functions; the other should wrap them rather than re-deriving the same governance logic.
