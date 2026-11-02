---
epic: 019-org-structure
feature: 002-reports-to
status: open
dependencies: []
---

# Reports-To on a Person

A person records who they report to. Today the only place a reporting line can live is "owner of the team I sit in", which is wrong whenever a manager has reports but no team, and is why the first org import had to name teams after people.

## Requirements

- [x] `users.manager_id` — nullable, same organization, not self. **One migration.**
- [x] REST: `POST /api/users` and `PUT /api/users/[id]` accept `managerId`; `GET` returns it. A cycle (A → B → A) is rejected with a 422 naming the loop.
- [x] UI: the user drawer shows and edits "Reports to" (a user picker scoped to the organization). A team page lists, for its owner, their direct reports with the ones outside this team marked.
- [x] Audit: changing a manager is an audit event like any other user mutation.
- [ ] 001's import sets `managerId` from `manager_email`.
- [x] Nothing else changes: policy and objective inheritance still follow the team tree, not the manager chain. (Whether a manager's policies should reach their reports across teams is a separate question; don't answer it here.)

## Acceptance Criteria

- [x] On a fresh instance: create two users, set one's manager to the other over REST, read it back; set the reverse and get 422.
- [x] `e2e/ui-walk.e2e.test.ts` gains a step that sets "Reports to" in the drawer and sees it on the team page.
- [x] Existing user tests stay green with `managerId` absent.

## Technical Notes

- `src/bcs/identity-access/` owns users; the drawer is under `src/app/(app)/teams/`.
- Keep the picker simple: the existing user search, filtered to the org. No org-chart rendering in this feature.
