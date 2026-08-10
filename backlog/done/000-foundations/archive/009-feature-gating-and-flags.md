---
type: foundations
item: 009-feature-gating-and-flags
status: done
deliverable: context/feature-gating.md
---

# Feature Gating & Flags

Tenet G1 requires every feature to ship behind a checked entitlement flag rather than a separate code branch or deploy — Free vs. Paid (and future custom-override) availability toggles via `resolveEntitlements()`. `007-entitlement-catalog` already defines the entitlement keys and their Free/Paid defaults; this item defines the *mechanism* every feature actually uses to gate on them, so "every feature ships behind a gate" is an enforced pattern, not a per-author convention re-derived each time.

## What We Need to Decide / Research

- The gate primitive: a shared `requireEntitlement(orgId, key)` / `hasEntitlement(orgId, key)` function every route handler and MCP tool calls — where does it live (`shared/` vs. inside Billing & Entitlements' contract), and what does it return/throw on a denied check?
- Where the gate is checked on each transport: REST route handler, MCP tool handler, and UI — three different enforcement points for what should be one underlying check, per tenet C1's "consistent on every transport" reasoning already applied to error handling.
- What a denied gate looks like on each transport: REST status code (ties into `context/api-conventions.md`'s `DomainError`/status table — likely a new `*_ENTITLEMENT_REQUIRED` code), MCP tool error text, and UI behavior (hide the surface entirely vs. show it disabled/upsell).
- Naming convention tying a feature to its entitlement key — e.g. does every feature file/PR reference the entitlement key it's gated by explicitly, and is there a lint/review check that a new route/tool has *some* gate call in its handler (even if the answer is "gated by a key that's `true` for everyone," to keep the pattern universal rather than opt-in)?
- Relationship to non-billing feature flags: are there flags that aren't tier-related at all (e.g. a kill switch, a staged rollout) — does this reuse the entitlement mechanism (an org-level override) or is that a genuinely separate system? Scope this item to entitlement-driven gating only if a separate ungated flag system isn't yet justified.

## Options / Considerations

- A single `requireEntitlement(orgId, key)` living in Billing & Entitlements' contract (not `shared/`) is consistent with the architecture's context map — every context already calls Billing as customer/supplier, so this is one more contract function, not a new cross-cutting shared module. `shared/` is reserved for things with no natural owning BC (per `context/repo-structure.md`); entitlement gating has an obvious owner.
- Reusing the entitlement override mechanism (`applyEntitlementOverride`) for non-billing kill-switch/rollout flags is tempting (no second system to build) but conflates "what a customer pays for" with "what's safe to ship" — worth explicitly deferring a separate flag system until a concrete kill-switch/rollout need exists, rather than building it speculatively now.

## Deliverable

`context/feature-gating.md` — the gate primitive's shape, the three-transport enforcement pattern (REST/MCP/UI), the denied-gate error convention (feeding into `context/api-conventions.md`'s error table), and an explicit scope note on non-billing flags.

## Dependencies

- `007-entitlement-catalog` (needs the key list and override mechanism this gate mechanism sits on top of)
- `004-api-and-error-conventions` (the denied-gate error shape extends its `DomainError` pattern)
