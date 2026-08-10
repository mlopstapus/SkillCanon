---
type: foundations
item: 007-entitlement-catalog
status: done
deliverable: context/entitlements.md
---

# Entitlement Catalog

PDR-004 established entitlements as per-org data rather than a hardcoded tier enum, deliberately deferring the actual Free/Paid default values so pricing/packaging could stay flexible. `009-billing-entitlements` can't be built without at least an initial catalog — the schema needs to know what keys exist even if the values are expected to change.

## What We Need to Decide / Research

- The initial entitlement key list: `ssoEnabled`, `maxTeams`, `maxApiKeys`, `auditRetentionDays`, `prioritySupport`, `seatLimit` were proposed in `bcs/billing-entitlements/CONTRACT.md` as examples — confirm the actual set and add any missing (e.g. `maxProjects`, `maxPromptVershistory`, `customBranding`).
- Free-tier default values for each key — these apply to every self-hosted install (see `bcs/billing-entitlements/OWNERSHIP.md`'s note: self-host always runs with billing disabled and Free defaults hardcoded).
- Paid-tier default values for each key.
- Which keys are realistically going to need a per-org override soon (the "Enterprise is Paid plus overrides" pattern from PDR-004) — SSO and audit retention are the obvious early candidates.
- Seat-based billing (confirmed in the architecture session) — how `seatLimit` interacts with Stripe's quantity/seat count on the subscription.

## Options / Considerations

- Keep the Free tier generous enough that self-hosters don't feel nickel-and-dimed (this is the OSS goodwill tier) while still making Paid's value obvious — e.g. Free could have no `maxTeams` limit at all (self-hosters run their own infra, a limit there doesn't protect anything) while Paid's value is really about *not running infra yourself* plus audit retention/SSO/support, not raw feature-gating.

## Deliverable

`context/entitlements.md` — the confirmed entitlement key list with Free and Paid default values, and notes on which keys are expected override candidates for custom deals.

## Dependencies

None, but blocks `009-billing-entitlements`.
