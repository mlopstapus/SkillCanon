# Epic 012: AI & MCP Governance Tools

**Priority:** deferred (excluded from the active sequence — see Notes)
**Status:** deferred
**Goal:** Give an org two front ends onto the same underlying capability — reading/mutating governance state (policies, objectives, teams, API keys) and summarizing/aggregating objectives — for both an external MCP-connected AI client and a bespoke in-app AI experience, gated to the paid tier.

## Overview

This started as two separate ideas and got merged (2026-08-02) once it was clear they're really one capability with two delivery paths, not two products:

- **MCP tools** (feature `001`): expose read/mutate governance operations and usage metrics as MCP tools, so a user's own external AI client (Claude Desktop/Code, etc.) can act as a SkillCanon administrator — this is a different shape of problem than `008-distribution/002-mcp-server-and-tools.md` (deprioritized), which is about *invoking governed prompts*, not *administering the system*. See that file's Technical Notes for why the invocation-vs-transport reasoning that deprioritized it doesn't apply here.
- **In-app AI features** (features `002`/`003`): an AI-driven interview flow that helps a team turn a loose conversation about goals/constraints into draft policies/tenets, and automated summarization/aggregation across objectives — built directly into the product rather than requiring an external client.

Both paths need the same underlying application-layer functions (read objectives, propose/apply a policy change, produce a summary/aggregate). Whichever feature is built first should own those functions; the other should wrap them with a different front end (MCP tool vs. in-app AI call) rather than re-deriving the same governance logic twice. This is also the first place in the codebase that would call an LLM directly (features `002`/`003`) — worth an explicit architecture/PDR pass on provider choice, cost model, and safety (human approval before any AI-authored policy takes effect) before real requirements get written.

This entire epic is paid-tier and depends on `009-billing-entitlements` for gating, which the user has deferred indefinitely (2026-08-02) in favor of a fully open-source/self-hosted launch. This epic inherits that deferral — don't schedule or start it until billing itself is picked back up. Captured now so the product idea isn't lost, not because it's about to be built.

## Features

- [ ] [001 - Admin & Metrics MCP Tools](001-admin-and-metrics-mcp-tools.md)
- [ ] [002 - AI Policy & Tenet Interview Assistant](002-ai-policy-and-tenet-interview-assistant.md)
- [ ] [003 - Objective Summarization & Aggregation](003-objective-summarization-and-aggregation.md)

*Completed features are moved to `archive/` and checked off here.*

## Dependencies

- `backlog/002-identity-access/EPIC.md`
- `backlog/005-governance/EPIC.md`
- `backlog/003-audit-compliance/EPIC.md`
- `backlog/008-distribution/EPIC.md` (REST routes feature 001 would likely wrap)
- `backlog/009-billing-entitlements/EPIC.md` (paid-tier gating — also deferred; see [[project_billing_deferred]])

## Notes

Feature 001 carries the same external-compatibility caution as any MCP tool surface: once a client configures against it, tool names/argument shapes become a de facto public contract.

No entitlement flags for any of these three features exist yet in `billing-entitlements`' `EntitlementSnapshot` — adding them is in scope for whichever feature in `009-billing-entitlements` first wires this epic's gating (likely `001-plan-and-entitlement-model.md`, revisited once this epic is actually picked up).

This epic is deliberately deferred with no real feature scoping done yet beyond placeholders — pick it up only once a concrete client, use case, or the billing epic itself is ready to move.
