# Research: Auth & Onboarding UI

## 1. Form submission mechanism: Server Actions, not Route Handlers

**Decision**: Each of the three mutating forms (login, register, invite-accept) is a Client Component using React 19's `useActionState` bound to a colocated `"use server"` Server Action (`actions.ts` next to each `page.tsx`). The action reads `FormData`, calls the relevant `identity-access` function with `authDb`, sets the session cookie via `next/headers`'s `cookies()` on success, and either returns `{ error }` state or calls `redirect()`.

**Rationale**: No Server Action exists anywhere in this codebase yet, but it is Next.js App Router's recommended, idiomatic mechanism for a form that mutates state and needs to set a cookie — `cookies().set()` is only callable from a Server Action or Route Handler, never a Server Component render. `useActionState` gives pending/error state without a separate client-side fetch layer or new dependency.

**Alternatives considered**:

- A Route Handler (`route.ts`) called via client-side `fetch`/`fetch` + manual state — rejected: more boilerplate (manual `FormData`→JSON, manual pending-state tracking) for no benefit, and no existing precedent favors it over Server Actions either.
- A single shared `actions.ts` for all three forms — rejected: each action has a distinct params shape and redirect target; colocating each with its own route keeps the diff for any single flow small and matches this repo's existing per-route colocation (`app-shell-access.ts` next to `(app)/layout.tsx`).

## 2. `previewInvitation`: new read-only backend function

**Decision**: Add `previewInvitation(db, token): Promise<InvitationPreview | null>` to `identity-access`'s application layer (`domain/invitation.ts`'s new `InvitationPreview` type; `application/preview-invitation.ts`). It calls `invitations-repo.findByToken`, then `organizations-repo.findById`/`teams-repo.findById` for display names, and `deriveInvitationState` for the terminal-state check — the same three lookups `acceptInvitation` already performs internally, just without the mutating `markAccepted`/`insertValidatedUser` steps. Returns `null` for an unrecognized token. Exposed via `CONTRACT.md` and the `index.ts` barrel, requiring `authDb` for the same reason `acceptInvitation` does (no organization context yet).

**Rationale**: The mockup's invite screen shows "Join {org}… as {role}" and a locked, read-only email field *before* the invitee submits anything (FR-017) — there was no way to do this with only the existing mutating `acceptInvitation`. This was flagged explicitly in the spec's Assumptions (per the source backlog item's instruction to surface, not silently build, a mockup-implied backend change) before being implemented.

**Alternatives considered**:

- Skip the preview and only reveal org/team/role/email after a successful (or failed) submission — rejected: contradicts the mockup (an explicit acceptance criterion is visual/functional parity with it) and is a materially worse UX (asking someone to pick a password before telling them what they're joining).
- Reuse `listInvitations` — rejected: it's org-admin-authenticated (`actingUser` required) and lists every invitation in an org; an anonymous invitee has neither an org session nor authorization to call it.
- Have `acceptInvitation` itself return preview data on a `dryRun` flag — rejected: conflates a read with a mutation-shaped function, and would still require calling it once before the real submit, which is the same two-call shape as adding a dedicated read function, just messier.

## 3. Auto-login after registration and invitation acceptance

**Decision**: `registerAction` and `acceptInviteAction` call `login(authDb, email, password)` immediately after their respective create call succeeds, using the email and password already present in the submitted `FormData` (for invite-accept, the email comes from the invitation record itself — see §5 below, not user input, since the mockup shows it locked/read-only). The resulting cookie is set the same way `loginAction` sets it; the page then redirects (`/welcome` for registration, `/dashboard` for invite-accept).

**Rationale**: Confirmed by the mockup's own invite-page copy ("You'll be signed in automatically once your account is created.") and the welcome page's own content (it shows the admin as already signed in) — this is no longer an assumed default but a literal, mockup-confirmed requirement (FR-016). It composes two already-existing, unchanged functions (`registerFirstRunAdmin`/`acceptInvitation` then `login`) rather than adding new session-issuance logic, satisfying FR-015.

**Alternatives considered**:

- Redirect to `/login` with a "account created, please sign in" message — rejected: contradicts the mockup's explicit copy and is worse UX for no compensating benefit.

## 4. Slug derivation for organization/team names

**Decision**: `registerAction` derives `organization.slug`/`team.slug` from the submitted `organization.name`/`team.name` via a small pure `slugify(name): string` helper (lowercase, non-alphanumeric runs collapsed to a single hyphen, leading/trailing hyphens trimmed), colocated at `register/slugify.ts` with its own unit test.

**Rationale**: `registerFirstRunAdmin`'s params require both `name` and `slug` for organization and team, but the mockup's register form collects only "Org name" and "Root team" — no slug input field anywhere. Auto-deriving is the only way to match the mockup exactly without adding fields the design never shows.

**Alternatives considered**:

- Add a visible slug field — rejected: not in the mockup, and the source backlog item's Technical Notes call for pure UI over already-shipped logic, not new form fields the design doesn't have.
- Use the raw `randomUUID()` as slug — rejected: slugs are meant to be human-legible per `docs/context/database-conventions.md`'s existing convention (test fixtures throughout the codebase already slugify `name`-like values, e.g. `` `acme-${randomUUID()}` ``).

## 5. Error mapping from domain errors to page-level UI states

**Decision**: Each Server Action catches the specific typed errors its underlying function can throw and maps them to a small, page-local result shape; anything unrecognized falls back to a generic "Something went wrong, please try again." message (Edge Cases: network/server failure).

| Action | Caught error | UI outcome |
|---|---|---|
| `loginAction` | `login()` returns `null` (no throw) | Generic "Incorrect email or password." (FR-003) |
| `registerAction` | `SecondOrganizationNotAllowedError` | Switches the page to the "already set up" terminal view (FR-006) |
| `registerAction` | `WeakPasswordError`, `DuplicateUserError` | Inline field-level message (message text is already safe to show verbatim — see `domain/user.ts`) |
| `acceptInviteAction` | `InvalidInvitationTokenError`, `InvitationExpiredError`, `InvitationAlreadyAcceptedError`, `InvitationRevokedError` | Not expected in normal operation (the page already branched on `previewInvitation`'s state before rendering the form) but handled identically to a fresh page load of that state, covering the race where the invitation changes state between page load and submit (Edge Cases: double-submit/race) |
| `acceptInviteAction` | `WeakPasswordError`, `DuplicateUserError` | Inline field-level message |

**Rationale**: All of these error classes already exist with safe, user-presentable `.message` text (confirmed by reading `domain/user.ts`/`domain/invitation.ts`) — no new error taxonomy needed, satisfying FR-015 and FR-008/FR-009.

## 6. Testing approach given no jsdom/`@testing-library`

**Decision**: Pure logic (`slugify`, error-mapping helpers, `auth-redirect.ts`'s access decision) gets direct Vitest unit tests. Server-rendered structure per page/state gets `renderToStaticMarkup` assertions (this repo's established convention — see `app-navigation.test.tsx`). Interactive behavior (password show/hide, pending/disabled states, actual end-to-end submission against a real local Postgres, and visual comparison against the mockup) is verified manually via the dev server in a real browser, documented as repeatable steps in `quickstart.md` — identical to `014-marketing-landing-page`'s precedent for the same infrastructure gap.

**Rationale**: Matches existing, already-established repo convention; adding jsdom/`@testing-library` for one feature would be a new project-wide testing dependency decision out of scope here.

## 7. Redirect-if-authenticated pattern

**Decision**: `src/app/(auth)/auth-redirect.ts` exports `resolveAuthPageAccess(cookieHeader, dependencies = { authenticateSession })`, mirroring `(app)/app-shell-access.ts`'s dependency-injection shape for testability. `/login`, `/register`, and `/invite/[token]`'s `page.tsx` each call it and `redirect("/dashboard")` when a session already exists (FR-004); `/welcome`'s `page.tsx` does the inverse — it requires a session and redirects to `/login` when none exists, since it is reachable only immediately after registration's auto-login.

**Rationale**: Reuses the exact pattern already proven in this codebase for the same class of problem (auth-gate a Server Component page before rendering), rather than inventing a new one.

## 8. Responsive behavior: brand rail hidden below a breakpoint

**Decision**: The mockup's CSS grid (`repeat(auto-fit, minmax(380px,1fr))`) would stack the decorative brand rail *above* the functional form on narrow viewports. Instead, the brand rail is hidden entirely below Tailwind's `lg` breakpoint, and the content section becomes full-width — the form is the only thing a mobile visitor sees.

**Rationale**: FR-014/SC-004 require full usability at mobile widths, and `014-marketing-landing-page`'s spec already established the precedent that "the mockup's fixed multi-column layouts are a desktop reference... reflow is expected." Stacking a large decorative hero block above the actual form on mobile is a materially worse UX than hiding it, for zero functional loss (all of the brand rail's content is marketing copy, not something a visitor needs to complete the flow).

**Alternatives considered**:

- Stack brand rail above content per the raw CSS grid's literal mobile behavior — rejected per the above.
