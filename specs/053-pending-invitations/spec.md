# Feature Specification: Pending Invitations List and Invitation E2E

**Branch**: `feat/015-008-pending-invitations` | **Created**: 2026-10-30 | **Input**: backlog/015-distribution-correctness/008-invitation-follow-ups.md (read with #126: the org is invitation-only)

## User Scenarios & Testing
### US1 - Admin sees and revokes pending invitations (P1)
On the Teams page's Members tab, an admin sees the selected team's pending invitations (email, role, who invited them, expiry date) and can revoke one. A revoked invitation disappears from the list and its link reports "revoked".
### US2 - Accepting is proven end to end (P1)
An invitee follows the emailed link, creates an account, lands signed in; the same link then reads as already accepted. Verified in the e2e stack via a mail sink (shipped in #129).

## Requirements
- FR-001 The invitation summary carries who invited and when it expires (no token).
- FR-002 Only org admins see the list (listing is admin-only already); non-admins see nothing.
- FR-003 Only pending invitations are listed; accepted, expired and revoked are not.
- FR-004 Revoke uses the existing authorization rules; errors are shown inline.

## Success Criteria
SC-001 After sending an invite the admin sees it pending without a manual refresh of the app. SC-002 After accept or revoke it is no longer listed.

## Assumptions
Shown per selected team on the Members tab. "Invited by" shows the inviter's display name ("Unknown" if the user is gone).
