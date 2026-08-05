---
epic: 004-app-shell-and-landing
feature: 004-dashboard-overview-content
status: done
dependencies: ["archive/002-app-shell-and-navigation.md"]
---

# Dashboard ("Overview") Content

Discovered 2026-08-05 while continuing `010-ui-polish-and-accessibility/001-cross-page-polish-and-accessibility.md`'s cross-page audit: `/dashboard` — the left nav's "Overview" link, the first thing an admin sees after registering or logging in — had never had real content built. `src/app/(app)/dashboard/page.tsx` was a static eyebrow + `<h1>Overview</h1>`, nothing else; it had been this way since `archive/002-app-shell-and-navigation.md` built the `/dashboard` "composition point" (its own words) without a page composed into it. No BC had ever claimed ownership: unlike `/prompts` (prompt-registry), `/teams`+`/teams/[teamId]/policies` (identity-access + governance), and `/metrics` (distribution), no epic's backlog had a "dashboard" or "overview" feature anywhere.

**Completed 2026-08-05.** No design mockup depicted real dashboard content — the two source mockups this app was built against (`SkillCanon Governance.dc.html`, `SkillCanon Prompts.dc.html`) both link to `/dashboard` from their nav but neither renders it. Built as an explicit design decision (confirmed with the user directly) rather than waiting on a mockup that doesn't exist, reusing this app's already-established visual vocabulary (the `MetricTile`-style stat card from `/metrics`, the row-list pattern from `/prompts`) instead of inventing new UI language.

## Requirements

- [X] Decide what the dashboard actually shows — a cross-BC workspace snapshot (team/member/project/prompt counts), a last-30-days usage summary, and a recent-prompts list — pulling from each owning BC's already-exported read functions (`listTeams`/`listUsers`/`getOrganization` from identity-access, `listProjectsByOrganization`/`listSkillsByOrganization` from prompt-registry, `getPromptUsageSummaryForOrganization` from distribution), no new BC capability added
- [X] Build the page against a real design — `src/app/(app)/dashboard/{page.tsx,dashboard-view.tsx}`, composed into the existing shell exactly like every other page (server page fetches, pure `DashboardView` renders, matching this repo's established 2-layer pattern for pages with no client-side interactivity)
- [X] Apply this repo's established empty/loading/error state conventions (`AppState` from `@/shared/ui`, per `docs/context/design-system.md` §7) from the start — the recent-prompts section's empty state uses `AppState variant="empty"` with a "Go to Prompts" action

## Acceptance Criteria

- [X] `/dashboard` shows real, useful content for a freshly-registered org (not just a title) and for an org with existing data — live-verified against a real self-hosted instance with real team/project/prompt/usage data
- [X] Content sources are real BC-exported reads, no fabricated/placeholder data — every field traces to a real query result, recent-prompts sorted by `updatedAt` (already-fetched data, no new query)
- [X] Empty/loading states follow the shared `AppState` pattern

## Open Questions

- **Resolved**: data-fetching lives in the dashboard's own `page.tsx` — a thin composition-only page calling into several existing BCs' exported reads, matching `010-ui-polish-and-accessibility`'s no-new-BC-logic convention for pure verification/composition features. No BC claimed "workspace summary" as its own owned concern.

## Dependencies

- `backlog/004-app-shell-and-landing/archive/002-app-shell-and-navigation.md` (the composition point this fills)

## Technical Notes

Filed and then resolved in the same working session — the initial audit (during `010-ui-polish-and-accessibility/001`) deliberately did not build placeholder content, per this repo's established convention that a real content gap found during an unrelated pass gets its own backlog item rather than a rushed inline fix. The user then explicitly asked to resolve this blocker (rather than leaving it deferred) to close out that pass, which is what authorized inventing dashboard content without a source mockup here — the same authorization is documented in `005-mobile-responsive-nav.md`.

Reused `metrics/page.tsx`'s existing `defaultMetricsWindow`/window-label pattern (re-implemented locally as `defaultUsageWindow`/`formatWindowLabel`, not exported/shared, matching this codebase's established preference for small per-page duplication over premature abstraction) for the last-30-days usage summary — same `getPromptUsageSummaryForOrganization` call metrics already makes, just a smaller field subset.
