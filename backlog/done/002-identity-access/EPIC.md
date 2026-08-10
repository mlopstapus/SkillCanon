# Epic 002: Identity & Access

**Priority:** 2
**Status:** done
**Goal:** Port tenancy, team hierarchy, users, auth, invitations, and API keys from the current Python backend into the new TS bounded context — establishing the Organization tenant root that every other context depends on.

## Overview

This is the first bounded-context port and the epic every other epic depends on for org/user/team identifiers. It's also where multi-tenancy actually gets built (PDR-003) — the current Python schema conflates "organization" with the root `Team` row and has globally-unique `email`/`username`/`name` constraints that don't survive a second tenant; this epic corrects both. It's also where the reusable M3 cross-tenant-denial test helper gets built, since every subsequent BC epic's own tenant-isolation-tests feature depends on it existing.

## Features

- [X] [001 - Organization Tenant Model](archive/001-organization-tenant-model.md)
- [x] [002 - Team Hierarchy](archive/002-team-hierarchy.md)
- [x] [003 - User Accounts & Registration](archive/003-user-accounts-and-registration.md)
- [X] [004 - JWT Session Auth](archive/004-jwt-session-auth.md)
- [x] [005 - Invitations](archive/005-invitations.md)
- [x] [006 - API Keys](archive/006-api-keys.md)
- [X] [007 - Tenant Isolation Tests & RLS](archive/007-tenant-isolation-tests-and-rls.md)
- [X] [008 - `authDb` Consumer Handoff](008-authdb-consumer-handoff.md)
- [X] [009 - Auth & Onboarding UI](archive/009-auth-and-onboarding-ui.md)
- [x] [010 - Account & Team Settings UI](archive/010-account-and-team-settings-ui.md)
- [x] [011 - Logout UI Wiring](archive/011-logout-ui-wiring.md)

*Completed features are moved to `archive/` and checked off here.*

## Dependencies

- `backlog/001-typescript-refactor-foundation/EPIC.md` (full epic — needs the scaffold, DB kernel, and CI)
- `backlog/000-foundations/006-auth-and-session-conventions.md`
- `backlog/004-app-shell-and-landing/EPIC.md` (features 009/010's UI composes into that epic's shell/tokens)

## Notes

Feature 007 (tenant isolation tests) should land alongside 001–006, not after — it's what proves M1/M2/M3 actually hold for this BC's own tables, and it's where the reusable cross-tenant test helper other epics will import gets built.

**Added 2026-07-23**: features 009/010 build this epic's real UI directly, same pattern as `003-audit-compliance/003-audit-log-ui.md` — a departure from this codebase's prior precedent of identity-access never building routes/pages (see CLAUDE.md's note on `007-user-accounts-registration`/`008-jwt-session-auth`, now `008-distribution` in the current numbering). Both are currently stubs pending a design mockup (see their own Open Questions).

**Added 2026-07-25**: feature 011 files a gap discovered while writing `009-auth-and-onboarding-ui`'s spec (`specs/015-auth-onboarding-ui`) — no UI path to log out exists anywhere in the product yet, and 009's scope deliberately excludes it (page inventory is login/register/invite-accept/welcome only). Small, independently shippable once the app shell exists (it already does, per 010's dependency).
