# RCA: Assigning a member during team creation doesn't add them to the team

**Date:** 2026-08-15
**Status:** Root cause identified (confirmed via code trace, not live repro)

## What broke

The user created a new team and used the New Team form's person-picker to "assign" an existing org admin (Bob) to it. After saving, Bob does not appear in the team's Members list, even though he's an active admin in the org.

## Causation chain

Symptom: Bob doesn't show up as a member of a newly created team after being "assigned" during creation.
  ↓ caused by
The Members tab (`src/app/(app)/teams/teams-explorer.tsx:307`) derives its member list purely from `users.teamId === team.id` (`membersByTeam`, built at line 225-234). Bob's `teamId` was never set to the new team.
  ↓ caused by
The only person-picker present on the New Team form (`team-form-drawer.tsx`) is the **Owner** select (lines 171-185) — there is no member/roster field on team creation at all. Selecting Bob there sets `ownerId`, submitted via `createTeamAction` → `createTeam` (`application/create-team.ts`) → `insert` (`infrastructure/teams-repo.ts:66-76`).
  ↓ caused by
`insert()` writes `ownerId` onto the new `teams` row only (`teams.owner_id`). Nothing in `createTeam`/`insert`, or anywhere else in the team-creation call path, ever updates `users.team_id` for the chosen owner (confirmed by reading the full function — no `users` write of any kind occurs).
  ↓ caused by
**ROOT CAUSE: The team-creation UI conflates two structurally distinct, unrelated relations under one control.** `teams.owner_id` (an administrative/governance pointer — "who administers this team") and `users.team_id` (the actual membership relation every other surface, including the Members tab, treats as "belongs to this team") are separate columns with no code path linking them. The New Team form exposes only the Owner picker, with no label or behavior distinguishing it from "add a member," so picking a person there reads to a user as "assign them to the team" — and the save succeeds with no error, since setting `ownerId` alone is a fully valid operation. There is no signal anywhere (validation, warning, help text) that the selection didn't also grant membership.

## Root cause

**Design/workflow gap (category: architecture / workflow):** team ownership (`teams.owner_id`) and team membership (`users.team_id`) are independent data relations, but the team-creation flow's only "assign a person" control is the Owner field, which never touches membership. The failure is silent — no error is thrown, no validation runs — because from the system's point of view nothing went wrong; the user's actual intent (add Bob as a member) was never expressed to any code path that could act on it.

This is directly downstream of a broader, related gap: **there is currently no UI path to add or reassign an org member to a team by picking them from a list at all**, except:
- **"Invite member" (email-based, `invite-member-drawer.tsx` → `inviteUser`)** — designed for people without an account yet. If the email belongs to an existing active user in the org (which Bob's does), `inviteUser` (`application/invite-user.ts:53-56`) throws `DuplicateUserError` ("A user with this email already exists in this organization") and adds nothing. This path is not silent — it surfaces a clear error in the drawer — so it's unlikely to be what actually happened, but it's a related dead end for exactly this use case.
- **"Unassigned" panel (`unassigned-users-panel.tsx` → `assignUserToTeamAction` → `updateUser`)** — the only control that actually sets `users.team_id`, but it's scoped to `users.filter(u => u.teamId === null)` (`teams-explorer.tsx:238`), so it only ever lists users with no team. A user already on another team (or, per the report, possibly an admin whose account predates team assignment but who could easily *not* be null) is invisible here too.

Notably, the backend already fully supports reassigning a user who's currently on a *different* team — `updateUser` (`application/update-user.ts:61-66`) validates only that the target team exists and belongs to the org; it places no restriction requiring the target user to be currently unassigned. The gap is entirely in the UI: no control anywhere lets an admin search/pick *any* org user (unassigned or already on a team) and assign or reassign them to a team by name.

## Contributing factors

- No test exercises "select an owner during team creation, then check the Members tab" — the disconnect between `ownerId` and `teamId` is a valid, silently-accepted state from the domain layer's perspective, so nothing flags it.
- The Owner select's `ownerOptions` filter for `mode === "new"` includes *every* org user regardless of current team (`team-form-drawer.tsx:57-59`), reinforcing the impression that picking someone there is a general "attach this person to the team" action rather than a narrow governance pointer.

## Evidence gaps

- Not reproduced live in a browser — this is a code-path trace, not an observed run. Confirming with a live repro (create team, set Owner to an existing admin, check Members tab) would remove the last inference step, but the code path leaves no other way for the described symptom to occur.
- Unconfirmed whether the user actually tried "Invite member" first and got (and perhaps dismissed/missed) the `DuplicateUserError`, versus only ever using the Owner field. The Owner-field path is the one consistent with a *silent* failure as described ("I don't see him listed... even though he is admin"), which is why it's identified as the root cause here.

## Fix

Two changes close this, addressing both the bug and the feature request in the same report:

1. **Decouple the symptom from its cause immediately:** stop letting the Owner picker imply membership. Either (a) restrict Owner selection to users already on the team/being added as members in the same submission, or (b) add explicit copy clarifying "Owner" is an administrative role, not membership.
2. **Build the real fix — a proper member picker**, replacing/extending the email-only invite flow and the unassigned-only panel with a single searchable dropdown of org users (not filtered to unassigned) available both in team creation and on the team detail page's Members tab, that calls `assignUserToTeamAction`/`updateUser` (already reassignment-capable) for any selected user — unassigned people get added, people already on another team get reassigned (moved) with no separate "remove first" step required. This is a real backlog-worthy feature, not a one-line patch — it needs a new UI component (org-user search/select, showing current team next to already-assigned people) and small server-action plumbing, but no backend/domain changes, since `updateUser` already supports arbitrary reassignment.

## Prevention

- Add a test (or extend `teams-explorer.test.tsx`) asserting that setting `ownerId` during team creation does **not** add that user to `membersByTeam` — makes the current (intentional, but confusing) decoupling explicit and would have caught if a future change accidentally coupled or decoupled them incorrectly.
- File the member-picker gap as a backlog item under the relevant epic (team/settings UI) rather than leaving it only in this report, per this repo's established "file discovered gaps as real backlog items" convention.
