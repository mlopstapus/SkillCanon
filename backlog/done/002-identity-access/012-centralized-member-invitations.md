---
epic: 002-identity-access
feature: 012-centralized-member-invitations
status: open
dependencies: ["archive/005-invitations.md", "archive/010-account-and-team-settings-ui.md"]
---

# Centralized Member Invitations

`040-team-member-assignment-picker` added a searchable "+ add member" picker to each team's own Members tab (`src/app/(app)/teams/teams-explorer.tsx`) for assigning/reassigning *existing* org users, sitting alongside the pre-existing per-team "+ invite by email" button (`invite-member-drawer.tsx` → `inviteUser`) for inviting brand-new people. While reviewing that change live, the user flagged that email invitation shouldn't live on each team's page at all — it should move to one centralized, org-wide Members area, from which an admin invites someone and assigns/routes them to a team in the same flow, rather than having to first pick a team and then find the invite button nested under it.

Explicitly out of scope for `040-team-member-assignment-picker` itself — filed here to track for a future pass, per this repo's convention of filing discovered gaps as real backlog items rather than only mentioning them in chat.

## Requirements

- [ ] Design (or pull from `claude.ai/design` per this epic's established mockup-first pattern) a centralized, org-wide "Members" surface — likely a new top-level nav item or a tab on an existing settings page — separate from the per-team `teams/[teamId]` detail view
- [ ] Move email invitation (`inviteUser`/`InviteMemberDrawer`) there; the invite flow should let the admin pick which team the invitee lands on as part of the same form, rather than requiring the admin to already be on that team's page
- [ ] Remove the per-team "+ invite by email" button from `teams-explorer.tsx`'s Members tab once the centralized flow exists (leave "+ add member," the existing-user picker added in `040-team-member-assignment-picker`, in place on the team page — that one is inherently team-scoped, unlike inviting a brand-new person)
- [ ] Decide whether the centralized page also duplicates/subsumes "+ add member" (existing-user assign/reassign) for a single one-stop member-management surface, or leaves that on the team page — open question, resolve during design

## Acceptance Criteria

- [ ] An admin can invite a brand-new person to a specific team from one centralized location, without first navigating into that team's own page
- [ ] The per-team Members tab no longer shows an email-invite control
- [ ] Existing `inviteUser`/invitation-acceptance backend logic (`archive/005-invitations.md`) is reused as-is — this is a UI relocation, not a backend redesign, unless design turns up a real gap

## Open Questions

- Does the centralized page replace the per-team Members tab entirely (i.e., team detail pages stop showing a member list at all, deep-linking instead to the centralized view filtered by team), or do both continue to show membership, with only invitation moving?
- Where does this live in the nav — its own top-level item, or folded into an existing settings page?

## Dependencies

- `archive/005-invitations.md` (the `inviteUser` backend this reuses)
- `archive/010-account-and-team-settings-ui.md` (the existing per-team Members tab this moves invitation off of)

## Technical Notes

No backend changes anticipated — `inviteUser(db, actingUser, { teamId, email, role })` already takes an explicit `teamId`, so a centralized form just needs a team picker instead of inferring `teamId` from the currently-open team page. Mostly a UI relocation plus nav/routing work.
