# Cross-Page Polish & Accessibility Quickstart

## Automated Checks

Run from the repo root:

```sh
pnpm lint
pnpm typecheck
pnpm test
```

Expected result: all commands pass with no critical or serious accessibility regressions covered by render assertions and static `axe-core` audits.

## Manual Smoke Path

Exercise the go-live path in a production-like dev environment:

1. Register a first account and organization.
2. Accept an invitation as a second user.
3. Create a team.
4. Create a project.
5. Create a governance policy.
6. Create a prompt.
7. Expand the prompt.
8. Create and run a skill-chain workflow.
9. View the audit log.

For each step, check:
- Keyboard tab order reaches every visible control in logical order.
- Focus indicators are visible on navigation, buttons, links, inputs, drawers, dialogs, rows, and pagination.
- Empty, loading, and error states use the documented pattern or have an accepted page-specific copy/action exception.
- Content is readable and not clipped at mobile, tablet, and desktop widths.
- Dark and light token contexts remain legible wherever the page supports both.

## In-Scope Route Inventory

- `/register`, `/login`, `/invite/[token]`, `/welcome`
- `/dashboard`
- `/teams`
- `/teams/[teamId]/policies`, `/teams/[teamId]/objectives` (added 2026-08-05, `031-governance-views-ui`)
- `/projects`, `/projects/[id]`
- `/prompts`, `/prompts/[name]`
- `/metrics`
- `/settings/api-keys`
- `/settings/audit-log`
- `/access-unavailable`

Billing UI is excluded while billing remains deferred.

## Manual Evidence Checklist

| Area | Evidence to record | Blocking condition |
| --- | --- | --- |
| Automated accessibility | `pnpm test` output for static axe audits | Any critical or serious violation |
| Keyboard navigation | Smoke-path tab order notes | Unreachable or pointer-only control |
| Screen-reader spot check | Landmark, heading, label, status, and row/detail notes | Confusing or missing context even when markup is technically valid |
| Responsive layout | Mobile, tablet, and desktop observations | Clipped content, overlapped UI, hidden required action, unintended horizontal scroll |
| Theme coverage | Dark mode and supported light token context observations | Unthemed surface or insufficient legibility |
| State-pattern exceptions | Route, reason, and accepted copy/action difference | Layout, role, focus, or responsive exception |

### Recorded Evidence (2026-08-05 continuation pass)

Covers `/teams`, `/metrics`, `/teams/[teamId]/policies`, `/teams/[teamId]/objectives`, `/projects/[id]`, `/prompts/[name]`, and the `(auth)` route group — the routes touched in this pass. The original 5 routes (`/prompts`, `/projects`, `/settings/audit-log`, `/settings/api-keys`, `/access-unavailable`) already had recorded evidence from the initial pass (not repeated here). `/dashboard` is excluded — see `backlog/004-app-shell-and-landing/004-dashboard-overview-content.md`, it has no real content to audit yet.

- **Automated accessibility**: `pnpm exec vitest run "src/app/(app)/teams" "src/app/(app)/metrics" "src/app/(app)/teams/[teamId]" "src/app/(app)/projects/[id]" "src/app/(app)/prompts/[name]" "src/app/(auth)"` — all pass, zero critical/serious axe violations, including new `expectNoCriticalOrSeriousAxeViolations` coverage added for teams' org-empty state, metrics' empty state, governance's policy/objective empty states, and the auth route group's `TerminalState` component (previously had zero test coverage at all).
- **Keyboard navigation**: manually tab-walked `/teams/[teamId]/objectives` at desktop width — reaches the app nav, scope-tree rows, tabs, and the "New objective" action in a logical order; visible focus rings render correctly at every stop (global focus-visible tokens, `docs/context/design-system.md` §7, apply correctly to newly-added `AppState` action buttons).
- **Empty/loading/error states**: converted 3 real page-level empty states from hand-rolled markup to `AppState` (`teams-explorer.tsx`'s org-wide "no teams" state, `metrics/page.tsx`'s "no usage" state, governance's two local-policy/objective empty states) — all now carry `role="status"`/`aria-live="polite"` and reuse the page's own primary action per the documented rule. Added `role="status"` to 8 existing in-page-section empty notices (`project-detail-view.tsx` ×6, `prompt-detail-view.tsx` ×3, `teams-explorer.tsx`'s sub-teams/members tabs, `unassigned-users-panel.tsx`) that stay as compact inline notices rather than adopting `AppState`'s full layout — see the new "Scope: page-level vs. in-page-section empties" rule in `docs/context/design-system.md` §7 for why. `(auth)` route group's `TerminalState` component (invite/register terminal states — expired, revoked, already-set-up) was missing `role`/`aria-live` entirely; fixed and given its first test coverage.
- **Responsive layout — BLOCKING FINDING**: at a true mobile viewport (390×844), the app shell's left nav never collapses on any page — confirmed on both `/prompts` and governance's pages. Governance's page is unusable at this width (its own scope-tree sidebar pushes all main content fully off-screen, unreachable without horizontal scroll). This is pre-existing, shell-wide, and not fixed by this pass — tracked at `backlog/004-app-shell-and-landing/005-mobile-responsive-nav.md`. Tablet width (768×1024) renders correctly on every route checked.
- **Theme coverage**: not re-verified beyond dark mode — per `CLAUDE.md`'s established convention, the authenticated `(app)` route group is dark-only by design (the light-token override only applies to the marketing landing page), so there is no second token context to check for these routes.
- **Drawer backdrop accessibility**: found and fixed 15 modal/drawer backdrop `<div onClick={onClose}>` scrims across the app missing `aria-hidden="true"` (only 1 of 16 had it, `event-detail-drawer.tsx`) — every one has a real, separately keyboard-reachable close button, so this was a decorative-marking consistency fix, not a keyboard-trap bug.
- **New content gap found (not a polish issue)**: `/dashboard` has never had real content — just a static title, present since the shell was first built. Not fixed here (no owning BC, no source mockup) — filed at `backlog/004-app-shell-and-landing/004-dashboard-overview-content.md`.
