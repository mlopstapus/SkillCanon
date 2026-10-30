---
epic: 018-internal-tribe-edition
feature: 002-one-tribe-organization
status: done
dependencies: []
---

# One Tribe Organization

The instance serves one organization. Ben said on 2026-10-29: "We can expose Canon as a singleton."

## Requirements

- [x] First-run setup creates the single organization and its first admin, as it does now. The organization name defaults to "Tribe".
- [x] Once an organization exists, `/register` no longer creates another one. A visitor without an invitation sees a short message: access is by invitation, and they should ask an admin. Self-serve sign-up and its slug field go.
- [x] Invitations (`/invite/[token]`) are the only way to join, and they work as they do today.
- [x] Every server path that creates an organization refuses a second one: the server action and any REST route. The UI isn't the only guard.
- [x] The schema, the RLS policies and `organization_id` columns stay unchanged.

## Acceptance Criteria

- [x] On a fresh instance: setup succeeds, `/register` then shows the invitation-only message, and posting the old register action directly creates no organization (a unit test proves this).
- [x] An invited user can still accept and sign in. The invite path is untouched and stays covered by `accept-invitation.test.ts`; an e2e accept is not possible because the token only travels by email and the walk cannot read it.
- [x] The existing tenant-isolation tests stay green.

## Technical Notes

- `src/app/(auth)/register/` (`actions.ts`, `register-form.tsx`, `slugify.ts`) and `src/bcs/identity-access/`.
- `isSelfHosted()` in `src/bcs/identity-access/domain/deployment-mode.ts` keys off `STRIPE_ENABLED`. Leave that flag alone, because billing is deferred, not removed. Don't add a new mode flag unless the code forces one.
