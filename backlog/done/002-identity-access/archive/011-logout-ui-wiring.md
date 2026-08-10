---
epic: 002-identity-access
feature: 011-logout-ui-wiring
status: open
dependencies: ["archive/004-jwt-session-auth.md", "backlog/004-app-shell-and-landing/archive/002-app-shell-and-navigation.md"]
---

# Logout UI Wiring

Discovered during `/speckit-specify` for `009-auth-and-onboarding-ui` (2026-07-25): no UI path to log out exists anywhere in the product yet. `identity-access`'s `logout(db, userId)` (see `bcs/identity-access/CONTRACT.md`) has been implemented and audit-logged since `004-jwt-session-auth`, but no route/action has ever called it. The authenticated app shell's `AccountFooter` component (`src/app/(app)/_components/account-footer.tsx`, built by `004-app-shell-and-landing/002-app-shell-and-navigation.md`) already renders a chevron affordance next to the user's identity, but it is purely decorative — no click handler, no menu, no logout call.

`009-auth-and-onboarding-ui.md`'s own page inventory (login/register/invite-accept/welcome) does not include this, and its Technical Notes explicitly scope it to those four pages only — so this gap was deliberately left out of that spec (`specs/015-auth-onboarding-ui/spec.md`'s Assumptions) rather than silently folded in.

## Requirements

- [X] Wire an actual "Log out" action into the existing `AccountFooter` (e.g., the existing chevron opens a small menu with a "Log out" item, or an equivalent minimal affordance) that calls `identity-access`'s `logout(authDb, userId)` and clears the session cookie — `AccountFooter` is now a client component; its chevron toggles a small always-in-DOM menu (visibility via a `hidden` class, not conditional unmount, for `renderToStaticMarkup` testability) containing a "Log out" button that submits to a new `"use server"` `logoutAction` (`src/app/(app)/logout-action.ts`)
- [X] After logout, the user is redirected to `/login`
- [X] No new page/route is required — pure wiring into the existing app shell

## Acceptance Criteria

- [X] A logged-in user can log out from anywhere in the authenticated app shell, ending up back at the login page with no active session — verified live in a real browser session
- [X] The logout action is audit-logged (already guaranteed by `logout()` itself — verified the UI's call path doesn't bypass it) — confirmed a `user.logout` row was written with the correct `actor_user_id`
- [X] Attempting to reuse the app (e.g., back button) after logging out does not show authenticated content — verified live: navigating back to `/teams` after logout redirects straight to `/login`

## Open Questions

- None — this is a small, well-scoped wiring gap against already-implemented backend logic and an already-built shell component.

## Dependencies

- `archive/004-jwt-session-auth.md` (delivers `logout()`)
- `backlog/004-app-shell-and-landing/archive/002-app-shell-and-navigation.md` (delivers `AccountFooter`, the component this wires into)

## Technical Notes

Per `bcs/identity-access/CONTRACT.md`'s "Connection Requirements" section, `logout` must be called with `authDb`, not the ordinary tenant-scoped `db` — it internally resolves the user via a bare `userId` with no organization context yet, the same reason `login`/`acceptInvitation`/`registerFirstRunAdmin` require it. Follow the same direct-bounded-context-call pattern `src/app/(app)/app-shell-access.ts` already uses for `authenticateSession`, rather than routing through a REST layer that doesn't exist yet (`008-distribution/001-rest-api-core-routes.md` is still unstarted).
