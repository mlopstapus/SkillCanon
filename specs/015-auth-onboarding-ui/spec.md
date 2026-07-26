# Feature Specification: Auth & Onboarding UI

**Feature Branch**: `015-auth-onboarding-ui`

**Created**: 2026-07-25

**Status**: Draft

**Input**: User description: "backlog/002-identity-access/009-auth-and-onboarding-ui.md"

**Design source**: `SkillCanon Auth.dc.html` (claude.ai/design project `7babdbf3-c063-46b5-84df-ffa9f588d88a`, the same project already backing the Audit/Governance/Landing mockups) — pulled in on 2026-07-25 after this spec's first draft, which had assumed no mockup existed yet per the source backlog item's note. The mockup covers exactly the four pages below, each with the states enumerated in their user story, confirming the structure this spec had already assumed and adding two concrete details folded in below: the invite page previews the destination org/team/role and the invitee's own (locked) email before submission (FR-017), and both registration and invitation acceptance explicitly sign the new user in automatically (FR-016) rather than that being a lower-confidence default.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Log in to an existing account (Priority: P1)

A returning user with a valid email and password signs in through a login page and lands inside the authenticated app.

**Why this priority**: This is the single most-used entry point on every visit after the first — without it, no existing user can ever get past the auth boundary.

**Independent Test**: Submit valid credentials on the login page and confirm the visitor is redirected into the authenticated app with an active session; submit invalid credentials and confirm no session is created.

**Acceptance Scenarios**:

1. **Given** a user with valid credentials, **When** they submit the login form, **Then** they are redirected into the authenticated app and their identity is reflected there.
2. **Given** a user with an invalid email or password, **When** they submit the login form, **Then** they see one generic, non-specific credential error and no session is created.
3. **Given** an already-authenticated user, **When** they navigate to the login page, **Then** they are redirected straight into the app without re-entering credentials.

---

### User Story 2 - Bootstrap the instance as the first admin (Priority: P1)

The very first person setting up a new self-hosted instance fills out a registration page once — organization name, root team name, and their own admin account details — to create the organization, team, and their own admin account together.

**Why this priority**: Nothing else in the product is reachable until an instance has at least one organization and admin account; this unblocks every other flow, including Story 1.

**Independent Test**: On a fresh instance with no organization yet, submit the registration form and confirm an organization, root team, and active admin account are created; on an already-bootstrapped instance, confirm the same form is rejected with a clear message instead of a raw error.

**Acceptance Scenarios**:

1. **Given** a fresh instance with no organization yet, **When** the first admin submits the registration form with valid details, **Then** an organization, root team, and their own active admin account are created.
2. **Given** an instance that has already been bootstrapped, **When** someone visits the registration page and submits it, **Then** they see a clear message that the instance is already set up and are directed to log in instead, and no partial or duplicate organization is created.
3. **Given** the admin submits the form with a password shorter than the minimum required length, **When** they submit, **Then** they see a clear validation error and no account is created.

---

### User Story 3 - Accept a team invitation (Priority: P1)

Someone invited by email to join an existing organization's team opens their personalized invite link, sets a username and password, and becomes an active member of that org/team.

**Why this priority**: This is the only way anyone other than the first admin ever joins the product — without it, an instance is permanently single-user.

**Independent Test**: Open a valid invite link, confirm the destination organization/team/role and the invitee's own email are shown before any submission, submit a username and password, and confirm a new active user is created scoped to exactly the invitation's own organization/team/role; confirm an expired, already-accepted, revoked, or unrecognized token each produce a distinguishable message rather than a generic failure.

**Acceptance Scenarios**:

1. **Given** a valid, unexpired, unaccepted invitation link, **When** the invitee opens it, **Then** they see which organization and team they're joining, in what role, and their own email address (read-only), before entering anything.
2. **Given** a valid, unexpired, unaccepted invitation link, **When** the invitee submits a username and password, **Then** a new active user is created scoped to the invitation's organization/team/role, and they are signed in and proceed directly into the app.
3. **Given** an invitation link that has expired, **When** the invitee opens it, **Then** they see a message explaining the invite has expired, not a generic error.
4. **Given** an invitation link that has already been accepted or was revoked, **When** the invitee opens it, **Then** they see a message specific to that state (already used / revoked), not a generic error.
5. **Given** a token that does not correspond to any invitation, **When** someone opens that URL, **Then** they see a not-found/invalid-invitation message, not a crash or raw error.

---

### User Story 4 - See a first-run welcome after setting up the instance (Priority: P2)

The first admin, having just finished registration, sees a brief welcome screen confirming their instance and organization are ready before entering the app for the first time.

**Why this priority**: Lower priority than the functional flows above — it's an orientation nicety that confirms success, not something that gates access to the product.

**Independent Test**: Complete first-run registration and confirm a welcome screen appears exactly once at that point, with a clear path from there into the authenticated app.

**Acceptance Scenarios**:

1. **Given** the first admin just completed registration, **When** the flow proceeds, **Then** they see a welcome/orientation screen naming their organization before continuing into the app.
2. **Given** the admin is on the welcome screen, **When** they choose to continue, **Then** they land in the authenticated app shell as their logged-in self.

---

### Edge Cases

- What happens when a login, registration, or invite-acceptance form is submitted with missing or malformed required fields? The visitor sees inline validation errors and nothing is submitted to the backend.
- What happens when the server or network fails mid-submission on any of the four pages? The visitor sees a clear, retry-capable error rather than an indefinite spinner or a silently swallowed failure.
- What happens if a form is submitted twice in quick succession (double-click, or two tabs racing to accept the same invitation)? No duplicate account or organization is created; both requests resolve to a consistent, non-crashing outcome (the backend already guarantees this — the UI must not defeat it by, for example, showing a false success on the losing request).
- What happens when an already-authenticated user opens `/register` or `/invite/[token]`? They are redirected into the app rather than shown a form that would fail or create a conflicting identity.
- What happens on narrow (mobile-width) viewports? All four pages remain legible and fully usable; forms and content reflow rather than clipping or requiring horizontal scroll.
- What happens if a visitor uses the browser back button after logging in? They are not shown a stale, cached view of the login/register/invite page while still authenticated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a login page (`/login`) that collects an email and password and submits them for authentication.
- **FR-002**: System MUST redirect a user into the authenticated app immediately after a successful login, establishing a session exactly as produced by the existing login/session-issuance logic.
- **FR-003**: System MUST show one generic, non-specific error for any failed login attempt (invalid email or invalid password), never revealing which field was wrong.
- **FR-004**: System MUST redirect an already-authenticated visitor away from `/login`, `/register`, and `/invite/[token]` straight into the authenticated app, rather than showing the form again.
- **FR-005**: System MUST provide a first-run registration page (`/register`) that collects the organization name, root team name, and the first admin's own account details (username, display name, email, password), and submits them together to create the organization, team, and admin account as a single unit.
- **FR-006**: System MUST reject registration attempts once the instance already has an organization, showing a clear, plain-language message directing the visitor to log in instead, rather than a technical or raw error.
- **FR-007**: System MUST provide an invite-acceptance page at `/invite/[token]` that collects a username and password (and optional display name) for the invited person and submits them, scoped to whatever organization/team/role the invitation token itself resolves to.
- **FR-008**: System MUST show a distinct, plain-language message for each terminal invitation state a visitor can land on — unrecognized/invalid token, expired, already accepted, and revoked — never a single generic failure for all four.
- **FR-009**: System MUST enforce the same field requirements already enforced by the underlying account-creation logic (e.g., minimum password length) on both the registration and invite-acceptance pages, surfacing the resulting validation errors inline rather than letting an invalid submission through.
- **FR-010**: System MUST provide a first-run "welcome" page shown once, immediately after a successful first-run registration, before the new admin proceeds into the authenticated app shell.
- **FR-011**: System MUST let the user on the welcome page proceed into the authenticated app shell as their own logged-in identity.
- **FR-012**: All four pages (login, register, invite-accept, welcome) MUST use the design-token system already established for the product rather than introducing ad hoc styling.
- **FR-013**: All four pages MUST render independently of the authenticated app shell — no persistent sidebar or in-app navigation from the app shell appears on them.
- **FR-014**: All four pages MUST remain fully usable at mobile, tablet, and desktop viewport widths.
- **FR-015**: System MUST NOT alter the existing form-validation, routing, or session-issuance behavior of the underlying login, registration, or invitation-acceptance logic — these pages present and submit against that logic as already built.
- **FR-016**: System MUST automatically sign a person in immediately after a successful registration or invitation acceptance (using the identity/credentials just submitted), rather than requiring a separate manual login step — confirmed by the design source's own invite-page copy ("You'll be signed in automatically once your account is created.").
- **FR-017**: System MUST show the invitee, before they submit anything, which organization and team they are joining, in what role, and their own email address (read-only, not editable) — requires resolving the invitation token to this display information without mutating it, distinct from the act of accepting it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A returning user with valid credentials can go from the login page to being inside the authenticated app in under 15 seconds.
- **SC-002**: A first-time instance operator can complete registration (organization, team, and admin account) and reach the welcome screen in a single pass, without retrying due to unclear errors, in at least 95% of attempts during usability testing.
- **SC-003**: 100% of the four terminal invitation states (invalid, expired, already accepted, revoked) produce a distinct, understandable message rather than a generic failure, verified by test.
- **SC-004**: All four pages remain fully readable and operable — no cut-off controls, no horizontal scrolling — at mobile (375px), tablet (768px), and desktop (1280px+) viewport widths.
- **SC-005**: No failed *login* attempt reveals whether a given email has an account, verified by test. (Scoped to login specifically — a registration or invite-acceptance submission telling the user their *chosen* username/email is already taken, per FR-009, is expected account-creation UX, not the account-existence enumeration this criterion guards against.)

## Assumptions

- The `/register` page is the self-hosted, single-instance first-run bootstrap flow only — matching the existing `bootstrapOrganization` logic's "self-hosted first-run only" guard, and confirmed by the design source's own footer copy ("self-hosted") — not a general, ongoing public sign-up page. No SaaS or multi-organization signup surface is in scope, since none exists elsewhere in the product yet.
- The first-run "welcome" page is a single static orientation screen — confirms the organization/instance is ready, states the admin's own identity, and offers one clear call-to-action into the app — not a multi-step guided product tour; the design source confirms this exact shape (a heading, three identity stat tiles for org/root team/role, one continue button). It is shown only once, immediately after first-run registration; a user who joins via invitation proceeds straight into the app without a separate welcome step (FR-016), since they are joining an already-set-up organization rather than creating one.
- FR-017 (previewing an invitation's destination org/team/role and the invitee's own email before submission) requires resolving an invitation token to read-only display information as a distinct capability from accepting it — today only the mutating accept path exists. This is a small, genuinely new read-only backend surface, not a UI-only change; flagged here per the source backlog item's own instruction to surface any mockup-implied change rather than silently build it, for `/speckit-plan` to account for.
- These pages call the identity-access bounded context's already-implemented `login`, `registerFirstRunAdmin`, and `acceptInvitation` functions directly — the same direct bounded-context-call pattern the existing authenticated app shell already uses for `authenticateSession` — rather than waiting on a separate REST API layer. The REST API epic (`008-distribution`'s `001-rest-api-core-routes`) remains unstarted and is not a dependency of this feature.
- Wiring a "log out" affordance into the existing app-shell account footer (currently a static, unwired display) is out of scope for this feature — the source backlog item's page inventory covers only login, register, invite-accept, and welcome. This is a real functional gap (no UI path to log out exists anywhere in the product yet), filed separately as `backlog/002-identity-access/011-logout-ui-wiring.md`.
