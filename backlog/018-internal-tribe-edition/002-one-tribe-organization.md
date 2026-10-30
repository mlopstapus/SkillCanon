---
epic: 018-internal-tribe-edition
feature: 002-one-tribe-organization
status: open
dependencies: []
---

# One Tribe Organization

The instance serves one organization. Ben said on 2026-10-29: "We can expose Canon as a singleton."

## Requirements

- [ ] First-run setup creates the single organization and its first admin, as it does now. The organization name defaults to "Tribe".
- [ ] Once an organization exists, `/register` no longer creates another one. A visitor without an invitation sees a short message: access is by invitation, and they should ask an admin. Self-serve sign-up and its slug field go.
- [ ] Invitations (`/invite/[token]`) are the only way to join, and they work as they do today.
- [ ] Every server path that creates an organization refuses a second one: the server action and any REST route. The UI isn't the only guard.
- [ ] The schema, the RLS policies and `organization_id` columns stay unchanged.

## Acceptance Criteria

- [ ] On a fresh instance: setup succeeds, `/register` then shows the invitation-only message, and posting the old register action directly creates no organization (a unit test proves this).
- [ ] An invited user can still accept and sign in (`e2e/ui-walk.e2e.test.ts`).
- [ ] The existing tenant-isolation tests stay green.

## Technical Notes

- `src/app/(auth)/register/` (`actions.ts`, `register-form.tsx`, `slugify.ts`) and `src/bcs/identity-access/`.
- `isSelfHosted()` in `src/bcs/identity-access/domain/deployment-mode.ts` keys off `STRIPE_ENABLED`. Leave that flag alone, because billing is deferred, not removed. Don't add a new mode flag unless the code forces one.
