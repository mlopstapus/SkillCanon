# Tasks: Auth & Onboarding UI

**Input**: Design documents from `/specs/015-auth-onboarding-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth-onboarding-ui.md, quickstart.md

**Tests**: Included — this repo's Constitution Principle I (Test-First Development) and its established UI-testing convention (`renderToStaticMarkup` structural tests, pure-logic unit tests) apply.

**Organization**: Tasks are grouped by user story (spec.md's priority order: US1 Login, US2 Register, US3 Invite-accept, US4 Welcome) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- **[X]**: Already complete (see plan.md Notes — done during spec research, before this tasks.md existed)

## Phase 1: Setup

**Purpose**: Confirm the environment is ready; no new dependency is needed (research.md §1).

- [X] T001 Confirm baseline is green before starting: `pnpm typecheck && pnpm lint && pnpm vitest run src/bcs/identity-access`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared shell/components and backend read path every one of the four pages depends on. No user-story page can be built until this phase is done.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Add `InvitationPreview` domain type in `src/bcs/identity-access/domain/invitation.ts`
- [X] T003 Implement `previewInvitation(db, token)` in `src/bcs/identity-access/application/preview-invitation.ts`
- [X] T004 Testcontainers test `src/bcs/identity-access/application/preview-invitation.test.ts` (6/6 passing)
- [X] T005 Update `src/bcs/identity-access/CONTRACT.md` (Exposed APIs row + Connection Requirements entry) and `src/bcs/identity-access/index.ts` barrel export for `previewInvitation`/`InvitationPreview`
- [X] T006 [P] Create `src/app/(auth)/_components/field-icons.tsx` (`EmailIcon`, `PasswordIcon`, `OrgIcon`, `TeamIcon`, `PersonIcon`, ported from the mockup's inline SVGs per contracts/auth-onboarding-ui.md)
- [X] T007 [P] Create `src/app/(auth)/_components/text-field.tsx` (labeled icon-prefixed input, CSS `focus-within:` styling, no client JS)
- [X] T008 [P] Create `src/app/(auth)/_components/password-field.tsx` (client component: adds the mockup's show/hide toggle)
- [X] T009 [P] Create `src/app/(auth)/_components/auth-button.tsx` (primary teal/sheen and secondary outlined variants, `pending` state)
- [X] T010 [P] Create `src/app/(auth)/_components/terminal-state.tsx` (icon + heading + message + single button — reused by register-blocked and all four invite terminal views per data-model.md)
- [X] T011 [P] Create `src/app/(auth)/_components/brand-rail.tsx` (logo mark, "Prompt control plane" eyebrow, headline, three feature bullets, Apache-2.0/self-hosted/version footer — verbatim copy from `SkillCanon Auth.dc.html`)
- [X] T012 Create `src/app/(auth)/layout.tsx` (ambient background layers + two-column grid: `brand-rail` hidden below `lg`, content slot for `{children}` — depends on T011, research.md §8)
- [X] T013 [P] Write `src/app/(auth)/auth-redirect.test.ts` FIRST (dependency-injected tests for the access decision — mirror `(app)/app-shell-access.test.ts`'s shape; must fail before T014)
- [X] T014 Implement `src/app/(auth)/auth-redirect.ts` exporting `resolveAuthPageAccess(cookieHeader, dependencies?)` (contracts/auth-onboarding-ui.md's Routes table) — makes T013 pass

**Checkpoint**: Shared shell, field/button/terminal components, and the redirect helper all exist and are tested; no route page wired to them yet.

---

## Phase 3: User Story 1 - Log in to an existing account (Priority: P1) 🎯

**Goal**: A returning user can sign in at `/login` and reach the authenticated app.

**Independent Test**: With a user row already in the database (seed directly, or complete Phase 4 first), submit valid credentials at `/login` and confirm redirect to `/dashboard` with a session cookie set; submit invalid credentials and confirm the generic error with no session created.

### Tests for User Story 1

- [X] T015 [P] [US1] Write `src/app/(auth)/login/login-form.test.tsx` FIRST — `renderToStaticMarkup` asserting the email/password fields, submit button, and register-link are present, error banner absent by default; must fail before T017

### Implementation for User Story 1

- [X] T016 [US1] Implement `src/app/(auth)/login/actions.ts`'s `loginAction` — calls `login(authDb, email, password)`; `null` → `{ error: "Incorrect email or password." }` (FR-003); success → set cookie from the returned `SessionCookieDescriptor`, `redirect("/dashboard")`
- [X] T017 [US1] Implement `src/app/(auth)/login/login-form.tsx` — Client Component, `useActionState(loginAction, ...)`, `PasswordField`/`TextField`/`AuthButton` composition, footer link to `/register` — makes T015 pass
- [X] T018 [US1] Implement `src/app/(auth)/login/page.tsx` — Server Component calling `resolveAuthPageAccess` (redirect to `/dashboard` if already authenticated, FR-004), renders `LoginForm`

**Checkpoint**: `/login` is fully functional and independently testable (given a seeded user row).

---

## Phase 4: User Story 2 - Bootstrap the instance as the first admin (Priority: P1)

**Goal**: The first admin can set up the organization, root team, and their own account at `/register` in one pass.

**Independent Test**: On a database with no organization yet, submit the registration form and confirm an organization/team/active-admin-user are created, the admin is auto-signed-in, and they land on `/welcome`; on an already-bootstrapped database, confirm the "already set up" view instead of a raw error.

### Tests for User Story 2

- [X] T019 [P] [US2] Write `src/app/(auth)/register/slugify.test.ts` FIRST — pure-function cases (lowercasing, non-alphanumeric collapsing, leading/trailing trim); must fail before T021
- [X] T020 [P] [US2] Write `src/app/(auth)/register/register-form.test.tsx` FIRST — `renderToStaticMarkup` asserting both field groups (Organization; Admin account) and the password hint text are present; must fail before T023

### Implementation for User Story 2

- [X] T021 [US2] Implement `src/app/(auth)/register/slugify.ts` — makes T019 pass
- [X] T022 [US2] Implement `src/app/(auth)/register/actions.ts`'s `registerAction` — calls `registerFirstRunAdmin(authDb, { organization, team, admin })` with slugs from T021; `SecondOrganizationNotAllowedError` → `{ status: "blocked" }` (FR-006); `WeakPasswordError`/`DuplicateUserError` → inline field error; success → `login(authDb, admin.email, admin.password)` for the cookie (FR-016), `redirect("/welcome")`
- [X] T023 [US2] Implement `src/app/(auth)/register/register-form.tsx` — two-group form plus the `blocked` → `TerminalState` "already set up" view (T010) — makes T020 pass
- [X] T024 [US2] Implement `src/app/(auth)/register/page.tsx` — `resolveAuthPageAccess` redirect-if-authenticated, renders `RegisterForm`

**Checkpoint**: `/register` is fully functional and independently testable; combined with Phase 3, `/login` now has a real account to authenticate against.

---

## Phase 5: User Story 3 - Accept a team invitation (Priority: P1)

**Goal**: An invitee can open `/invite/[token]`, see who/what they're joining, and become an active member.

**Independent Test**: Seed a pending invitation row directly (quickstart.md §5), open its link, confirm the org/team/role/locked-email preview renders before any submission, submit username/password, and confirm a new user scoped to that org/team/role is created and auto-signed-in; seed expired/accepted/revoked/nonexistent tokens and confirm each distinct terminal view.

### Tests for User Story 3

- [X] T025 [P] [US3] Write `src/app/(auth)/invite/[token]/invite-form.test.tsx` FIRST — `renderToStaticMarkup` asserting the locked email, org/team/role copy, and username/password/display-name fields render given a sample `InvitationPreview`; must fail before T027

### Implementation for User Story 3

- [X] T026 [US3] Implement `src/app/(auth)/invite/[token]/actions.ts`'s `acceptInviteAction` — calls `acceptInvitation(authDb, token, { username, password, displayName })`; maps `InvalidInvitationTokenError`/`InvitationExpiredError`/`InvitationAlreadyAcceptedError`/`InvitationRevokedError` to the matching terminal view (race case, contracts/auth-onboarding-ui.md), `WeakPasswordError`/`DuplicateUserError` to inline field error; success → `login(authDb, result.user.email, password)` (FR-016, using the email from the result, never a form field), `redirect("/dashboard")`
- [X] T027 [US3] Implement `src/app/(auth)/invite/[token]/invite-form.tsx` — makes T025 pass
- [X] T028 [US3] Implement `src/app/(auth)/invite/[token]/page.tsx` — calls `previewInvitation(authDb, token)`, branches per data-model.md's mapping table to `InviteForm` or one of the four `TerminalState` (T010) views (FR-008)

**Checkpoint**: `/invite/[token]` is fully functional and independently testable for all five states.

---

## Phase 6: User Story 4 - See a first-run welcome after setting up the instance (Priority: P2)

**Goal**: The first admin sees a confirmation/orientation screen immediately after registration.

**Independent Test**: Complete registration (Phase 4) and confirm `/welcome` renders the org/team/role stat tiles and the admin's name, with a working CTA into `/dashboard`; visiting `/welcome` without a session redirects to `/login`.

### Tests for User Story 4

- [X] T029 [P] [US4] Write `src/app/(auth)/welcome/page.test.tsx` FIRST — `renderToStaticMarkup` asserting the heading, three stat tiles, and CTA render given a sample `AppSessionUser`/org; must fail before T030

### Implementation for User Story 4

- [X] T030 [US4] Implement `src/app/(auth)/welcome/page.tsx` — requires a session (`authenticateSession(authDb, cookieHeader)`, else `redirect("/login")`), reads the org via `getOrganization(user.orgId)`, renders heading/stat-tiles/CTA (`redirect` target `/dashboard`) — makes T029 pass

**Checkpoint**: All four routes/nine states are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T031 [P] `pnpm typecheck && pnpm lint` clean across all new files
- [X] T032 [P] `pnpm vitest run "src/app/(auth)" src/bcs/identity-access/application/preview-invitation.test.ts` all green
- [X] T033 Manual verification per quickstart.md — all nine states, responsive check (~375px/~768px), design parity against `SkillCanon Auth.dc.html` in a real browser (dev server)
- [X] T034 Update `backlog/002-identity-access/009-auth-and-onboarding-ui.md`'s checkboxes against what's actually true and move to `archive/` once every Requirement/Acceptance Criteria is met (per this repo's archiving convention — don't force-complete anything not actually done)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all four user stories.
- **User Stories (Phase 3–6)**: All depend on Foundational completion. US1/US2/US3 (all P1) can proceed in any order or in parallel once Phase 2 is done; US4 (P2) only becomes practically demonstrable once US2 exists (welcome is reached via registration's auto-login), though its own page code has no file-level dependency on US2's files.
- **Polish (Phase 7)**: Depends on all four stories being complete.

### Within Each User Story

- Tests written and failing before implementation (Constitution Principle I).
- Server Action (`actions.ts`) before the form Client Component that calls it.
- Form component before `page.tsx` (which composes it).

### Parallel Opportunities

- Phase 2: T006–T011 (all distinct `_components/*` files) in parallel; T013 in parallel with those.
- Once Phase 2 completes: US1, US2, US3 can be built in parallel (distinct directories, no shared file edits) by different contributors/sessions.
- Within each story, the `[P]`-marked test task can run in parallel with other stories' test tasks.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch all shared component builds together:
Task: "Create field-icons.tsx in src/app/(auth)/_components/field-icons.tsx"
Task: "Create text-field.tsx in src/app/(auth)/_components/text-field.tsx"
Task: "Create password-field.tsx in src/app/(auth)/_components/password-field.tsx"
Task: "Create auth-button.tsx in src/app/(auth)/_components/auth-button.tsx"
Task: "Create terminal-state.tsx in src/app/(auth)/_components/terminal-state.tsx"
Task: "Create brand-rail.tsx in src/app/(auth)/_components/brand-rail.tsx"
```

## Parallel Example: User Stories 1–3 (after Phase 2)

```bash
Task: "Build /login (T015-T018)"
Task: "Build /register (T019-T024)"
Task: "Build /invite/[token] (T025-T028)"
```

---

## Implementation Strategy

### MVP First

Phase 1 → Phase 2 → Phase 4 (US2, Register) → Phase 3 (US1, Login) gives the
smallest end-to-end usable loop: bootstrap the instance, then sign back in.
Spec.md's own priority order lists Login (US1) first since it's the
higher-traffic long-term flow, but Register must exist first for Login to
have anything to authenticate against in a fresh environment — build both
before calling anything demoable, then layer in US3 (Invite) and US4
(Welcome).

### Incremental Delivery

1. Setup + Foundational → shell ready, nothing user-visible yet.
2. US2 (Register) + US1 (Login) → a working single-admin instance.
3. US3 (Invite-accept) → the instance can grow past one user.
4. US4 (Welcome) → orientation polish on top of an already-complete loop.
5. Polish → typecheck/lint/tests green, manual/browser verification, backlog item archived.

---

## Notes

- `[P]` tasks touch different files with no dependency on an incomplete task.
- Commit after each task or logical group, per this repo's normal practice.
- T002–T005 are marked `[X]` because they were implemented and tested during
  spec research (before this tasks.md existed) — see `plan.md`'s Notes for
  why, and rerun T004's test to reconfirm rather than re-implementing it.
