---
epic: 002-identity-access
feature: 005-invitations
status: done
dependencies: ["003-user-accounts-and-registration.md", "backlog/000-foundations/008-third-party-services.md"]
---

# Invitations

Port the invitation flow from the current Python `invitation_service.py` — inviting a user to an organization's team by email, token-based acceptance. Now needs to send actual email (the current Python implementation's email-sending story should be checked — if it's stubbed, this feature also closes that gap using the provider decided in the third-party-services foundations item).

## Requirements

- [x] `identity_access.invitations` table: `id`, `organization_id`, `team_id`, `email`, `role`, `token` (unique), `invited_by_id`, `accepted_at` (nullable), `expires_at`, `created_at` — plus a new `revoked_at` (nullable) column beyond the original list, added for the revoke capability (see Technical Notes)
- [x] Create invitation: generates a token, sends an email via the chosen provider (or logs to console in local dev if email isn't configured — self-host shouldn't hard-fail without SMTP set up)
- [x] Accept invitation: validates token + expiry, creates the `User` scoped to the invitation's organization/team, marks `accepted_at`
- [x] Expired or already-accepted tokens are rejected with a clear error

## Acceptance Criteria

- [x] Creating an invitation and accepting it with a valid token creates a user correctly scoped to the inviting org/team
- [x] An expired token is rejected
- [x] A token from organization A cannot be used to join organization B (should be structurally impossible, not just checked — the token encodes/resolves to one org)

## Open Questions

- ~~Does invitation creation require the email provider to be configured, or degrade gracefully (log the invite link) for self-hosted installs without SMTP set up?~~ Resolved before this feature's implementation began: `context/third-party-services.md` (decided 2026-07-21) already settled this as graceful degradation — email is best-effort, never a precondition for invitation creation. See that document's "Implementation status" section for what `009-invitations` actually delivered (SMTP path; SES deferred).

## Dependencies

- `003-user-accounts-and-registration.md`
- `backlog/000-foundations/008-third-party-services.md`

## Technical Notes

Per tenet M1, `token` resolves to exactly one organization — this feature must not allow an invitation created for org A to be redeemable in a way that lands the new user in org B. Delivered via `acceptInvitation`'s design: the resulting account's organization/team/role are read only from the invitation's own row, never from any parameter the caller supplies — see `specs/009-invitations/spec.md`'s FR-007 and its accompanying two-organization negative test.

This feature's `/speckit-clarify` session (2026-07-23) resolved two design questions not fully specified above: (1) authorization for creating/revoking invitations is admin-**or**-team-owner, not admin-only — a team's designated owner (`teams.owner_id`) may manage invitations for their own team even without the admin role; (2) a revoked invitation is tracked as a distinct fourth lifecycle state (`revoked`, via a new `revoked_at` column), not folded into `expired` or hard-deleted — this also added a `revokeInvitation`/`listInvitations` pair beyond the three Requirements bullets originally scoped above. Full detail in `specs/009-invitations/spec.md`'s Clarifications section and `research.md` §§1, 3, 6.
