---
epic: 015-distribution-correctness
feature: 008-invitation-follow-ups
status: open
dependencies: []
---

# Invitation Follow-ups

Found while closing out `007-ui-defects`.

## Requirements

- [ ] The Teams page lists pending invitations (email, role, invited by, expiry) with a revoke action. `listInvitations` and `revokeInvitation` already exist in `identity-access`; no page or route uses them.
- [ ] Accepting an invitation is verified end to end. The accept token is only delivered by email, so this needs either a test SMTP sink (e.g. MailHog in the e2e stack) or a documented way to read the token in tests.

## Open Questions

- Is a test SMTP container acceptable in the e2e Compose stack? Default: yes, a small dev-only service in the CI e2e job.
