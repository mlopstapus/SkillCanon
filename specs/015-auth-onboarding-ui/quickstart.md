# Quickstart: Auth & Onboarding UI

## Prerequisites

- `pnpm install`
- A running Postgres reachable via `DATABASE_URL`/`AUTH_DATABASE_URL`/`MIGRATION_DATABASE_URL` (`docker compose up -d database`, or the full stack) with migrations applied (`pnpm db:migrate`).
- Fresh database (no `identity_access.organizations` row) for the first pass through `/register` — `docker compose down -v` first if you've registered before on this volume.

## Run

```bash
pnpm dev
```

Open `http://localhost:3000/register` (or `:3001` if `3000` is already bound by a prior `docker compose` session — see project notes).

## Automated checks

```bash
pnpm vitest run src/bcs/identity-access/application/preview-invitation.test.ts
pnpm vitest run "src/app/(auth)"
pnpm typecheck
pnpm lint
pnpm build
```

## Manual verification (no jsdom in this repo — interaction/visual checks happen in a real browser)

1. **First-run registration**: on a fresh database, visit `/register`, fill the
   form, submit. Confirm you land on `/welcome` already signed in (check
   DevTools → Application → Cookies for `sh_session`), see the org/team/"You:
   Admin" stat tiles with your real submitted names, then click "Enter
   SkillCanon →" and confirm you land on `/dashboard` inside the authenticated
   app shell.
2. **Register-blocked state**: with an organization now existing, visit
   `/register` again and submit — confirm the "This instance is already set
   up" view appears (not a raw error), and "Go to sign in" → `/login`.
3. **Login**: visit `/login`, sign in with the admin credentials from step 1 —
   confirm redirect to `/dashboard`. Sign out (or clear the cookie), try an
   invalid password — confirm the generic "Incorrect email or password."
   message, no hint about which field was wrong.
4. **Already-authenticated redirect**: while signed in, visit `/login`,
   `/register`, and `/invite/anything` directly — each redirects straight to
   `/dashboard` without showing a form.
5. **Invite-accept, happy path**: this feature doesn't include an admin UI to
   send invitations yet (`010-account-and-team-settings-ui` isn't built), so
   create one directly against the dev database:
   ```sql
   -- find your org/team/admin ids first:
   -- select id from identity_access.organizations;
   -- select id from identity_access.teams;
   -- select id from identity_access.users;
   insert into identity_access.invitations
     (id, organization_id, team_id, email, role, token, invited_by_id, expires_at)
   values
     (gen_random_uuid(), '<org-id>', '<team-id>', 'kai@example.com', 'member',
      'test-invite-token', '<admin-user-id>', now() + interval '6 days');
   ```
   Visit `/invite/test-invite-token` — confirm it shows "Join {org}", the team
   name, the role, and the locked `kai@example.com` (not editable). Submit a
   username/password — confirm you land signed in on `/dashboard` (no
   `/welcome` step for invited users).
6. **Invite terminal states**: insert three more invitations with
   `expires_at` in the past, `accepted_at` set to `now()`, and `revoked_at`
   set to `now()` respectively (one each), and one more request to a token
   that matches no row at all. Visit each — confirm the four distinct
   messages from `contracts/auth-onboarding-ui.md`'s Terminal views table,
   each with a working "back to sign in" button.
7. **Password show/hide**: on any password field, click "show"/"hide" —
   confirm the input's visible text toggles accordingly.
8. **Responsive check**: resize to ~375px and ~768px — confirm the brand rail
   disappears below the `lg` breakpoint and the form remains fully usable
   with no horizontal overflow, on all four pages/states exercised above.
9. **Design parity**: spot-check colors/spacing/type against
   `SkillCanon Auth.dc.html` (re-fetch via `DesignSync get_file` if you need a
   side-by-side reference) — dark tokens, teal accent, sheen animation on
   primary buttons.

## Expected outcome

All nine states across the four routes render and function per
`contracts/auth-onboarding-ui.md`, matching spec.md's Success Criteria SC-001
through SC-005, with no change to the underlying login/registration/
invitation-acceptance logic (FR-015).
