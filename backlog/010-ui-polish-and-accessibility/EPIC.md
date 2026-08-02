# Epic 010: UI Polish & Accessibility

**Priority:** 11
**Status:** not-started
**Goal:** A final consistency and accessibility pass across every page in the product, once every page already has its own real, finished design — the last thing that happens before go-live.

## Overview

**Redistributed (2026-07-23), formerly "Epic 009/010: UI Redesign".** This epic originally owned applying the Claude design mockups across every page as one big pass at the end. That approach assumed pages would ship with placeholder/unstyled UI and get their real look later. In practice, `003-audit-compliance/003-audit-log-ui.md` proved a different pattern works instead: each epic builds its own page with real, finished design directly, using its own Claude design mockup, as soon as that mockup exists — no placeholder-then-redesign step. The user decided to make that the standing pattern for the whole backlog, not a one-off.

As a result, this epic's original per-page features were distributed into the epics that actually own each page:

| Former feature here | New home |
|---|---|
| `001-design-tokens-and-theming.md` | already done, `backlog/004-app-shell-and-landing/archive/001-design-tokens-and-theming.md` |
| `002-auth-and-onboarding-redesign.md` | `backlog/002-identity-access/009-auth-and-onboarding-ui.md` |
| `003-workspace-redesign.md` (dashboard/teams/projects) | Dashboard/landing → already done, `backlog/004-app-shell-and-landing/archive/003-marketing-landing-page.md`, and the shell's own composition (already done, `backlog/004-app-shell-and-landing/archive/002-app-shell-and-navigation.md`); teams → `backlog/002-identity-access/010-account-and-team-settings-ui.md`; projects → `backlog/006-prompt-registry/006-prompt-registry-views-ui.md` |
| `004-governance-views-redesign.md` | `backlog/005-governance/005-governance-views-ui.md` |
| `005-prompt-registry-views-redesign.md` | `backlog/006-prompt-registry/006-prompt-registry-views-ui.md` |
| `006-workflow-views-redesign.md` | `backlog/006-prompt-registry/010-skill-chain-views-ui.md` (formerly `007-workflow-orchestration/005-workflow-views-ui.md`, retired per [PDR-017](../../docs/pdr/017-fold-workflow-orchestration-into-prompt-registry.md)) |
| `007-settings-and-admin-views-redesign.md` (api-keys/org-team/audit-log/billing) | api-keys/org-team → `backlog/002-identity-access/010-account-and-team-settings-ui.md`; audit-log → already done, `backlog/003-audit-compliance/003-audit-log-ui.md`; billing → `backlog/009-billing-entitlements/003-billing-portal-and-ui.md` |
| `008-cross-page-polish-and-accessibility.md` | Stays here, renumbered `001-cross-page-polish-and-accessibility.md` — this is the one thing that genuinely can't be distributed, since it needs every other page done first |

What's left in this epic is exactly that last row: a final cross-page pass, once everything above is actually built.

## Features

- [ ] [001 - Cross-Page Polish & Accessibility](001-cross-page-polish-and-accessibility.md)

*Completed features are moved to `archive/` and checked off here.*

## Dependencies

- `backlog/002-identity-access/EPIC.md` (features 009/010)
- `backlog/004-app-shell-and-landing/EPIC.md`
- `backlog/005-governance/005-governance-views-ui.md`
- `backlog/006-prompt-registry/006-prompt-registry-views-ui.md`
- `backlog/006-prompt-registry/010-skill-chain-views-ui.md`
- `backlog/011-vcs-integration/006-vcs-integration-dashboard-ui.md`

## Notes

**Billing dependency dropped (2026-08-02):** this epic no longer depends on `backlog/009-billing-entitlements/003-billing-portal-and-ui.md` — that epic is now deferred indefinitely (no billing/paid tier before a future go-live decision, see its own `EPIC.md`), so this epic's cross-page pass must not gate on a billing UI page that may not exist. If billing is ever built later, its UI page should get its own consistency pass at that time rather than reopening this epic.

**Priority renumbered 10→11 (2026-07-25):** `011-vcs-integration` was slotted in at priority 9, ahead of Billing (formerly priority 10, now deferred) and this epic. This epic still comes last since it depends on every other page (including VCS Integration's new dashboard) being built first.

This epic no longer gates on `backlog/000-foundations/010-design-system.md` directly — that foundations item's deliverable (`context/design-system.md`) is now produced by `backlog/004-app-shell-and-landing/001-design-tokens-and-theming.md`, much earlier in the backlog than this epic's original slot.

If a future page redesign surfaces a real UX gap (missing empty state, confusing flow, etc.) during that page's own owning-epic build, track it as a new feature in that epic, not here — this epic's scope is verification/consistency across already-built pages, not building anything new itself.
