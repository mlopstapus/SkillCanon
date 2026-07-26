# Implementation Plan: Auth & Onboarding UI

**Branch**: `015-auth-onboarding-ui` | **Date**: 2026-07-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-auth-onboarding-ui/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Build the four pre-auth pages a visitor sees before entering the authenticated app shell — `/login`, `/register` (self-hosted first-run bootstrap), `/invite/[token]` (accept-invite), and `/welcome` (first-run orientation) — as a new `src/app/(auth)/` route group, ported directly from the `SkillCanon Auth.dc.html` Claude Design mockup. Each page is a thin Server Component wrapping a Client Component form driven by a `"use server"` Server Action that composes the identity-access bounded context's already-implemented `login`, `registerFirstRunAdmin`, and `acceptInvitation` functions — no existing validation, routing, or session-issuance logic changes (FR-015). One small new read-only function, `previewInvitation`, is added to identity-access so the invite page can show the destination org/team/role and the invitee's own email before submission (FR-017) — the only genuinely new backend behavior this feature needs; it has already been implemented, contract-documented, and tested ahead of this plan (see Notes below), reusing the same repo lookups `acceptInvitation` itself already uses internally.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 24; React 19.2

**Primary Dependencies**: Next.js 16.2 App Router — Server Actions (`"use server"`) and `useActionState` for the three mutating forms (no prior Server Action usage exists yet in this codebase; this is the natural, idiomatic Next.js pattern for form submission + cookie mutation, and Route Handlers would add boilerplate with no established precedent either way). Existing design tokens (`src/app/globals.css`); `bcryptjs`/JWT signing already used, unchanged. No new runtime dependency required.

**Storage**: PostgreSQL via `identity-access`'s existing repos. One new read-only query path (`previewInvitation`, composing `invitations-repo.findByToken` + `organizations-repo.findById` + `teams-repo.findById`, all already existing); no schema change.

**Testing**: Vitest 4.1. `previewInvitation` gets a Testcontainers-backed application-layer test (same pattern as `accept-invitation.test.ts`) — already written and passing. Server-rendered page/component structure is verified via `renderToStaticMarkup` (this repo's established convention, no jsdom/`@testing-library` dependency). Client-side interactive behavior (password show/hide, form pending/error states, redirects, cookie issuance) is verified by running the dev server in a real browser per `quickstart.md`, matching `014-marketing-landing-page`'s precedent for the same testing gap.

**Target Platform**: Modern browsers served by the unified Next.js application (the same `app` Docker Compose service); no new deployment surface.

**Project Type**: Full-stack web application — this feature touches both `src/app/(auth)/*` (new route group, presentational + Server Actions) and `src/bcs/identity-access` (one new read-only application-layer function + its `CONTRACT.md`/barrel export).

**Performance Goals**: No specific new target beyond standard page load; no new heavy assets (fonts/keyframes already self-hosted and shared with the rest of the app).

**Constraints**: FR-015 — MUST NOT alter existing login/registration/invitation-acceptance validation, routing, or session-issuance logic, only compose it from the UI layer. FR-004 — an already-authenticated visitor MUST be redirected away from `/login`/`/register`/`/invite/[token]` before the form ever renders. Cookie issuance MUST use `login()`'s `SessionCookieDescriptor` fields verbatim (`httpOnly`/`secure`/`sameSite`/`path`/`maxAge`), never a hand-rolled cookie.

**Scale/Scope**: Four routes (`/login`, `/register`, `/invite/[token]`, `/welcome`), nine distinct UI states across them (login default/error; register open/blocked; invite form/expired/accepted/revoked/invalid; welcome), one new backend read function.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First Development** — PASS. `previewInvitation` was built test-first (Testcontainers test written alongside it, red→green confirmed). Every further pure/testable unit (error-message mapping, slug derivation) gets a failing test before implementation; every page/component gets a `renderToStaticMarkup` structural test.
- **II. Domain-Driven Bounded Contexts** — PASS. The one new backend function lives inside `identity-access`'s own application layer and is exposed through its `CONTRACT.md`/barrel, exactly like every other function this UI calls. `src/app/(auth)/*` imports the bounded context only through that public barrel, never an internal module.
- **III. Domain Invariants Live in the Domain Layer** — PASS. `previewInvitation` reuses the existing `deriveInvitationState` domain function rather than re-deriving invitation-state logic in the UI layer or a route handler.
- **IV. Multi-Tenant Isolation by Default** — PASS. `login`/`registerFirstRunAdmin`/`acceptInvitation`/`previewInvitation` are all pre-tenant by design (no organization context exists yet at the point they're called) and already use `authDb`, per `CONTRACT.md`'s Connection Requirements — this feature adds no new tenant-scoped table or query.
- **V. Secure by Default** — PASS. Login failures stay generic (FR-003/SC-005, no account-existence enumeration); passwords are never logged; the session cookie is issued exactly as `login()` already builds it (httpOnly, `secure` outside dev, `sameSite=lax`).
- **VI. Auditable & Compliant (SOC2)** — PASS. Every mutation this feature triggers (`login`, `registerFirstRunAdmin`, `acceptInvitation`) already audit-logs itself internally; this feature adds no new mutation. `previewInvitation` is a read, not a mutation, and reveals nothing beyond what the invitation token itself already grants access to (the same trust boundary `acceptInvitation` already relies on).
- **VII. Feature-Gated by Entitlement** — **Exception, justified for the pre-auth pages** (see Complexity Tracking), same reasoning as `014-marketing-landing-page`'s identical exception: `login`, the invite-accept flow, and the welcome page have no resolved organization to gate against at the point they render. `/register` is not a new exception — `registerFirstRunAdmin` already calls `assertCoreFeaturesEnabled()` internally (existing code, unchanged by this feature).

**Post-design re-check**: PASS. Phase 1 design below adds no new mutation, no new tenant-scoped table, and no bounded-context boundary violation — the Complexity Tracking exception is unchanged by design detail.

## Project Structure

### Documentation (this feature)

```text
specs/015-auth-onboarding-ui/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── auth-onboarding-ui.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── bcs/
│   └── identity-access/
│       ├── domain/invitation.ts                  # + InvitationPreview type (done)
│       ├── application/
│       │   ├── preview-invitation.ts              # NEW — read-only token→display resolver (done)
│       │   └── preview-invitation.test.ts         # NEW — Testcontainers test (done, passing)
│       ├── CONTRACT.md                            # + previewInvitation row, Connection Requirements entry (done)
│       └── index.ts                               # + previewInvitation export (done)
└── app/
    └── (auth)/
        ├── layout.tsx                             # server: two-column brand-rail + content shell
        ├── auth-redirect.ts                       # server: redirect-if-authenticated helper (mirrors (app)/app-shell-access.ts)
        ├── auth-redirect.test.ts                  # pure-logic test via dependency injection
        ├── _components/
        │   ├── field-icons.tsx                    # server: small inline SVG icon set
        │   ├── text-field.tsx                     # server: labeled icon-prefixed input
        │   ├── password-field.tsx                 # client: adds show/hide toggle
        │   ├── auth-button.tsx                     # server: primary/secondary CTA button
        │   ├── terminal-state.tsx                 # server: icon+heading+message+button (5 reuses)
        │   └── brand-rail.tsx                     # server: logo, tagline, feature bullets, footer meta
        ├── login/
        │   ├── page.tsx                           # server: redirect-if-authenticated, renders LoginForm
        │   ├── login-form.tsx                     # client: useActionState(loginAction)
        │   ├── login-form.test.tsx                 # renderToStaticMarkup structural coverage
        │   └── actions.ts                          # "use server": loginAction
        ├── register/
        │   ├── page.tsx
        │   ├── register-form.tsx
        │   ├── register-form.test.tsx
        │   ├── actions.ts                          # "use server": registerAction (+ local slugify helper)
        │   └── slugify.ts                          # pure: name → slug, with its own unit test
        ├── invite/
        │   └── [token]/
        │       ├── page.tsx                        # server: calls previewInvitation, branches to form or terminal state
        │       ├── invite-form.tsx
        │       ├── invite-form.test.tsx
        │       └── actions.ts                       # "use server": acceptInviteAction
        └── welcome/
            ├── page.tsx                            # server: requires session, reads AppSessionUser, renders stat tiles + CTA
            └── page.test.tsx
```

**Structure Decision**: New `src/app/(auth)/` route group, mirroring the existing `(app)/` route group's own conventions (`_components/` subfolder, a small dependency-injectable access-check module at the group root). Shared field/button/terminal-state components live in `(auth)/_components/`, scoped to this route group only — not promoted to `src/shared/ui`, since none of the rest of the product uses this exact form-field chrome and the repo's established pattern (marketing pages, app shell) is to keep presentational components scoped to the route group that uses them unless a second real consumer appears. The one backend change stays inside `identity-access`'s own layered structure, exposed only through its existing `CONTRACT.md`/barrel — `src/app/(auth)/*` never imports an internal `identity-access` module directly.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| G1 (Feature-Gated by Entitlement) not applied to `/login`, `/invite/[token]`, `/welcome` | These pages render for a visitor with no resolved session/organization yet (or, for `/welcome`, immediately after one was just created) — `resolveEntitlements()` has no stable tenant to gate against at that point, the same reasoning already established for pre-auth Identity & Access functions (`bcs/identity-access/CONTRACT.md`) and for `014-marketing-landing-page`'s identical exception | Gating against a fabricated/default org would be meaningless and would wrongly imply these pages have tenant-scoped behavior, which they must not (they exist specifically to establish that context) |

## Notes

**Implementation status (2026-07-25, pre-dating this plan):** `previewInvitation` (domain type, application function, Testcontainers test, `CONTRACT.md`/barrel updates) was implemented during spec research, before this plan was written, when pulling the `SkillCanon Auth.dc.html` mockup revealed the invite page's pre-submission preview requirement (FR-017). It is small, self-contained, already passing (`pnpm vitest run src/bcs/identity-access/application/preview-invitation.test.ts` — 6/6), and documented in the spec's Assumptions per the source backlog item's instruction to flag rather than silently build mockup-implied backend changes. `/speckit-tasks` should record it as already complete rather than re-deriving it. The `src/app/(auth)/*` UI layer itself is *not* yet built — an earlier attempt at building it directly (bypassing this plan/tasks phase) was reverted at the user's direction in favor of following the proper `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` sequence.
