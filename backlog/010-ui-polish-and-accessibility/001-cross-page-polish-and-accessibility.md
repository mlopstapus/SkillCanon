---
epic: 010-ui-polish-and-accessibility
feature: 001-cross-page-polish-and-accessibility
status: open
dependencies: ["backlog/002-identity-access/009-auth-and-onboarding-ui.md", "backlog/002-identity-access/010-account-and-team-settings-ui.md", "backlog/004-app-shell-and-landing/EPIC.md", "backlog/005-governance/005-governance-views-ui.md", "backlog/006-prompt-registry/006-prompt-registry-views-ui.md", "backlog/006-prompt-registry/010-skill-chain-views-ui.md"]
---

# Cross-Page Polish & Accessibility

**Scope reduced (2026-07-23)**: this epic originally owned redesigning every page as one big pass at the very end. That's no longer how pages get their real design — each owning epic now builds its own page with real, finished design directly (mirroring `003-audit-compliance/003-audit-log-ui.md`'s pattern), so per-page redesign features (auth/onboarding, workspace, governance, prompt-registry, workflow, settings/admin views, and design tokens) were distributed into those owning epics. See this epic's `EPIC.md` for the full redistribution record. What's left, and genuinely can't be distributed, is this: a final consistency/accessibility pass across every page *after* every owning epic's own UI feature is actually done — the one thing that can only happen once everything else exists.

## Requirements

- [ ] Empty, loading, and error states are visually consistent across every page built across all owning epics (one pattern per state type, not a different one per page)
- [ ] Light/dark mode (per whatever `004-app-shell-and-landing/001-design-tokens-and-theming.md` decided) verified across every page, not just the pages built first
- [ ] Keyboard navigation and focus states verified across every page
- [ ] Accessibility audit (automated — e.g. axe — plus manual screen-reader spot-check) across every page; issues fixed, not just logged
- [ ] Responsive layout verified end-to-end across the full page set at mobile/tablet/desktop breakpoints

## Acceptance Criteria

- [ ] Automated accessibility scan reports no critical/serious violations on any page
- [ ] A single documented pattern each for empty/loading/error states, referenced from `context/design-system.md`
- [ ] Manual smoke test across the full app: register → accept invite → create a team → create a project → create a policy → create a prompt → expand it → create a workflow → run it → view the audit log — every step visually consistent with no regressions from any individual page feature

## Open Questions

- None currently.

## Dependencies

- `backlog/002-identity-access/009-auth-and-onboarding-ui.md`
- `backlog/002-identity-access/010-account-and-team-settings-ui.md`
- `backlog/004-app-shell-and-landing/EPIC.md`
- `backlog/005-governance/005-governance-views-ui.md`
- `backlog/006-prompt-registry/006-prompt-registry-views-ui.md`
- `backlog/006-prompt-registry/010-skill-chain-views-ui.md` (formerly `007-workflow-orchestration/005-workflow-views-ui.md`, retired per [PDR-017](../../docs/pdr/017-fold-workflow-orchestration-into-prompt-registry.md))

## Technical Notes

This is still the last feature before go-live — treat its acceptance criteria as the definition of done for the UI as a whole, not just this one feature's. Unlike before, it depends on features scattered across several different epics rather than a handful of siblings in this same epic — track all of them, not just the ones that happen to live in this folder.

Billing (epic 009) is dropped from this dependency list — it's deferred indefinitely (no billing before a future go-live decision, see `backlog/009-billing-entitlements/EPIC.md`), so this pass covers every page across the product's open-source/self-hosted surface without waiting on a billing UI that may never ship in this form.
