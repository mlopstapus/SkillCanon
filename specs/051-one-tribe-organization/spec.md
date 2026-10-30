# Feature Specification: One Tribe Organization

**Feature**: `051-one-tribe-organization` · **Backlog**: `backlog/018-internal-tribe-edition/002-one-tribe-organization.md`

## User Scenarios
- **US1** On a fresh instance, first-run setup at `/register` creates the single organization (name defaults to "Tribe"), its root team and first admin.
- **US2** After that, a visitor to `/register` sees "Access is by invitation" with a link to sign in, and no form.
- **US3** Posting the register action directly once the organization exists creates nothing, in any deployment mode.
- **US4** Invitations (`/invite/[token]`) work as before.

## Requirements
- **FR-001** `isInstanceSetUp(db)` (identity-access) reports whether the organization exists.
- **FR-002** `registerInstance(db, input)` refuses with `SecondOrganizationNotAllowedError` whenever the instance is set up, regardless of `STRIPE_ENABLED`; the register action calls it.
- **FR-003** The register page shows the invitation-only notice when set up; the form's organization name field defaults to "Tribe".
- **FR-004** No schema, RLS or `organization_id` change; `createOrganization`'s own mode-conditional guard and `STRIPE_ENABLED` are untouched. No REST route creates organizations, so no route change is needed.

## Assumptions
No migration. Copy is minimal here; the Tribe voice pass is 018/004.
