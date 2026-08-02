# Epic 009: Billing & Entitlements

**Priority:** deferred (excluded from the active sequence — see Notes)
**Status:** deferred
**Goal:** Build the SaaS monetization layer — Stripe subscriptions, per-org entitlements — the first genuinely new capability in this backlog, nothing like it exists in the current app.

## Overview

Everything before this epic is a refactor: existing functionality, rebuilt correctly on the new foundation. This epic is new. It's placed near the end deliberately — the self-hosted Free tier (fully usable as of epic 008) never needs it, and building it late means it's built against a fully-working product rather than in parallel with a product still being ported. Per PDR-004, entitlements are data (per-org flags/limits), not a hardcoded tier switch — this epic is where that design gets implemented, not redesigned.

**Deferred indefinitely (2026-08-02):** the user wants the product to launch and run fully open-source/self-hosted, with no billing or paid-tier gating at all, until a separate future decision to stand up a paid/SaaS offering. This epic stays out of the active priority sequence until that decision is made — don't schedule or start any of its features as part of normal backlog progression. Nothing else in the backlog depends on it: `src/bcs/billing-entitlements` already ships a provisional `resolveEntitlements()` stub that always returns the Free-tier snapshot with no Stripe dependency (see its `CONTRACT.md`), which is exactly the open-source-first behavior wanted here, and every other epic's UI already treats billing as optional (see `010-ui-polish-and-accessibility`, which dropped its dependency on this epic's feature 003 for the same reason).

**Priority renumbered 9→10 (2026-07-25):** `011-vcs-integration` (the GitHub PR/skill-usage governance feature) was slotted in at priority 9 instead, ahead of monetization — it's the core governance value proposition, has no dependency relationship with Billing, and the Free tier doesn't need billing to be useful. Folder name kept as `009-billing-entitlements` — only the `Priority:` field moved, per this backlog's convention of not renaming existing epic folders. (Superseded by the 2026-08-02 deferral above — priority is no longer a queue position at all.)

## Features

- [ ] [001 - Plan & Entitlement Model](001-plan-and-entitlement-model.md)
- [ ] [002 - Stripe Checkout & Subscription Sync](002-stripe-checkout-and-subscription-sync.md)
- [ ] [003 - Billing Portal & UI](003-billing-portal-and-ui.md)
- [ ] [004 - Entitlement Enforcement Integration](004-entitlement-enforcement-integration.md)

*Completed features are moved to `archive/` and checked off here.*

## Dependencies

- `backlog/008-distribution/EPIC.md` (full product must exist before monetizing it)
- `backlog/000-foundations/007-entitlement-catalog.md`
- `backlog/000-foundations/005-deployment-environments-and-aws-topology.md` (Stripe webhook needs a real deployed URL)

## Notes

Feature 004 goes back and wires real `resolveEntitlements()` calls into the hardcoded-Free-tier-default stand-ins left in earlier epics (notably `003-audit-compliance/002-audit-query-and-retention.md`) — check for other stand-ins introduced along the way before considering this epic done.
