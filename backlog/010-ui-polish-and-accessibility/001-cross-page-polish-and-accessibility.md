---
epic: 010-ui-polish-and-accessibility
feature: 001-cross-page-polish-and-accessibility
status: open
dependencies: ["backlog/002-identity-access/009-auth-and-onboarding-ui.md", "backlog/002-identity-access/010-account-and-team-settings-ui.md", "backlog/004-app-shell-and-landing/EPIC.md", "backlog/005-governance/archive/005-governance-views-ui.md", "backlog/006-prompt-registry/006-prompt-registry-views-ui.md", "backlog/006-prompt-registry/010-skill-chain-views-ui.md"]
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

**Status check (2026-08-05):** real work has landed — `specs/001-cross-page-polish/tasks.md` shows 27/27 checked, and the `AppState` component + `src/shared/testing/accessibility.ts` axe helper + focus-visible CSS tokens are real, shipped infrastructure. But this is partial, not complete: only 5 pages were actually touched (prompts-list, projects-list, audit-log, api-keys, access-unavailable) against a much larger in-scope route inventory the spec itself lists (teams, dashboard, metrics, settings, auth pages never touched). The Acceptance Criteria's manual smoke test above (which already required "create a policy") was previously impossible to perform — no policy/objective UI existed anywhere — and the spec's own "Manual Evidence Checklist" was found empty, not filled in with recorded results. This item stays `open`; do not mark it done from the 27/27 tasks.md checkmark alone.

**Update (2026-08-05):** `005-governance-views-ui` shipped and archived (`backlog/005-governance/archive/005-governance-views-ui.md`) — the "create a policy" step of the manual smoke test is no longer blocked; `/teams/[teamId]/policies` and `/objectives` are real, live-verified pages. The remaining blockers on this item are unchanged and still real: (1) only 5 of the full route inventory's pages have had the actual empty/loading/error/accessibility/responsive pass applied — teams, dashboard, metrics, settings, and auth pages (plus the two new governance pages themselves) still need it; (2) the full end-to-end smoke test (register → invite → team → project → policy → prompt → expand → workflow → run → audit log) still hasn't been run and recorded in the spec's Manual Evidence Checklist. Governance's own two new pages were built to this repo's existing design-token/`AppState`/accessibility conventions but were not run through this feature's own formal audit tasks — don't assume they're covered by the 27/27 without checking them against this item's actual checklist.

**Update (2026-08-05, partial smoke test run):** the register → team → project → policy → prompt → expand portion of the chain was run live end-to-end (as part of verifying `backlog/008-distribution/003-web-ui-shell-and-core-pages.md`'s own smoke test) and confirmed working with no visual regressions. The invite/workflow-run/audit-log portion of this item's own longer chain was not run and remains open, and no results were recorded in the spec's Manual Evidence Checklist — this was ad hoc verification, not the formal audit this item requires.

## Dependencies

- `backlog/002-identity-access/009-auth-and-onboarding-ui.md`
- `backlog/002-identity-access/010-account-and-team-settings-ui.md`
- `backlog/004-app-shell-and-landing/EPIC.md`
- `backlog/005-governance/archive/005-governance-views-ui.md`
- `backlog/006-prompt-registry/006-prompt-registry-views-ui.md`
- `backlog/006-prompt-registry/010-skill-chain-views-ui.md` (formerly `007-workflow-orchestration/005-workflow-views-ui.md`, retired per [PDR-017](../../docs/pdr/017-fold-workflow-orchestration-into-prompt-registry.md))

## Technical Notes

This is still the last feature before go-live — treat its acceptance criteria as the definition of done for the UI as a whole, not just this one feature's. Unlike before, it depends on features scattered across several different epics rather than a handful of siblings in this same epic — track all of them, not just the ones that happen to live in this folder.

Billing (epic 009) is dropped from this dependency list — it's deferred indefinitely (no billing before a future go-live decision, see `backlog/009-billing-entitlements/EPIC.md`), so this pass covers every page across the product's open-source/self-hosted surface without waiting on a billing UI that may never ship in this form.
