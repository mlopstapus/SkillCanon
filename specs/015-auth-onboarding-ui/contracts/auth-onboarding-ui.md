# Auth & Onboarding UI Contract

## Routes

| Route | Auth requirement | Redirect target on wrong auth state |
|---|---|---|
| `/login` | Must be unauthenticated | Authenticated visitor → `/dashboard` |
| `/register` | Must be unauthenticated | Authenticated visitor → `/dashboard` |
| `/invite/[token]` | Must be unauthenticated | Authenticated visitor → `/dashboard` |
| `/welcome` | Must be authenticated (only reachable via registration's auto-login) | Unauthenticated visitor → `/login` |

None of the four routes render inside the `(app)` route group's shell — no
persistent sidebar/nav (FR-013).

## Login contract

| Field | Input type | Notes |
|---|---|---|
| `email` | `email`, `autoComplete="email"` | |
| `password` | `password`, `autoComplete="current-password"`, show/hide toggle | |

- Submit calls `login(authDb, email, password)`.
- `null` result → generic error: "Incorrect email or password." (FR-003,
  SC-005 — never reveals which field was wrong or whether the account
  exists).
- Success → set cookie from `login()`'s returned `SessionCookieDescriptor`
  verbatim, `redirect("/dashboard")`.
- Footer link: "Setting up a new instance? Run first-run setup →" → `/register`.

## Register contract

Two labeled groups, per the mockup:

**Organization**

| Field | Input type | Notes |
|---|---|---|
| `orgName` | `text` | → `organization.name`; `organization.slug` derived via `slugify(orgName)` |
| `teamName` | `text` | → `team.name`; `team.slug` derived via `slugify(teamName)` |

**Admin account**

| Field | Input type | Notes |
|---|---|---|
| `displayName` | `text` | → `admin.displayName` |
| `username` | `text`, `autoComplete="username"` | → `admin.username` |
| `email` | `email`, `autoComplete="email"` | → `admin.email` |
| `password` | `password`, `autoComplete="new-password"`, show/hide toggle, hint: "Minimum 8 characters. Hashed with bcrypt — never stored in plain text." | → `admin.password` |

- Submit calls `registerFirstRunAdmin(authDb, { organization, team, admin })`.
- `SecondOrganizationNotAllowedError` → page switches to the "already set up"
  terminal view: heading "This instance is already set up", body explaining
  first-run setup can only run once, single button "Go to sign in" → `/login`
  (FR-006).
- `WeakPasswordError`/`DuplicateUserError` → inline message under the
  relevant field, using the error's own `.message` text verbatim.
- Success → `login(authDb, admin.email, admin.password)` for the cookie
  (FR-016), then `redirect("/welcome")`.
- Footer link: "Already set up? Sign in →" → `/login`.

## Invite-accept contract

Server Component `page.tsx` calls `previewInvitation(authDb, token)` and
selects a view per the Data Model's mapping table before rendering anything
client-side.

**`invite-form` view** (state `"pending"`)

| Field | Input type | Notes |
|---|---|---|
| (locked, read-only) | — | Shows `preview.email`, styled as locked/non-editable, with a "locked" indicator |
| `displayName` | `text`, optional | → `displayName` |
| `username` | `text`, `autoComplete="username"` | → `username` |
| `password` | `password`, `autoComplete="new-password"`, show/hide toggle | → `password` |

Heading: "Join {preview.orgName}". Body: "You've been invited to the
{preview.teamName} team as {preview.role}." Footnote: "This invitation
expires in {N} days. You'll be signed in automatically once your account is
created." (FR-016, FR-017).

- Submit calls `acceptInvitation(authDb, token, { username, password,
  displayName })`.
- Typed invitation errors thrown at submit time (a state-changed-since-preview
  race) resolve to the same terminal view their state would produce on a
  fresh load (see below) — not a separate generic error.
- `WeakPasswordError`/`DuplicateUserError` → inline field message.
- Success → `login(authDb, result.user.email, password)` for the cookie
  (using the email from `acceptInvitation`'s own `UserSummary` result, not a
  form field — the invitee never types their email), then
  `redirect("/dashboard")`. No `/welcome` step for invited users (they're
  joining an already-set-up org, not creating one).

**Terminal views** (`invite-expired` / `invite-accepted` / `invite-revoked` /
`invite-invalid`), each: icon, heading, one-sentence explanation, single
button back to `/login` (FR-008):

| `previewInvitation` state | Heading | Button label |
|---|---|---|
| `null` (invalid) | "Invitation not found" | "Back to sign in" |
| `"expired"` | "This invitation has expired" | "Back to sign in" |
| `"accepted"` | "This invitation was already accepted" | "Go to sign in" |
| `"revoked"` | "This invitation was revoked" | "Back to sign in" |

## Welcome contract

- Requires an active session (`authenticateSession(authDb, cookieHeader)`);
  reads the `AppSessionUser` for `displayName`/`teamName`/org name (via
  `getOrganization(user.orgId)`).
- Heading: "Welcome, {displayName}." Body names the organization and confirms
  the visitor is signed in as the admin.
- Three stat tiles: Org name, Root team name, "You: Admin".
- Single CTA: "Enter SkillCanon →" → `redirect("/dashboard")`.

## Design-token contract

All four pages use only tokens already defined in `src/app/globals.css` /
`docs/context/design-system.md` — no ad hoc color/spacing/type value (FR-012).
The pages are dark-only, like the rest of the authenticated-adjacent app;
`[data-theme="light"]` is never set on any element in this route group (that
override stays scoped to the marketing subtree per
`archive/001-design-tokens-and-theming.md`).
