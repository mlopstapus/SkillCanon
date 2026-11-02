# Feature Specification: Reports-To on a Person

**Feature**: `055-reports-to` · **Backlog**: `backlog/019-org-structure/002-reports-to.md` · **Migration**: one (`users.manager_id`, a nullable self-referencing FK). Number: generated as 0043 on this branch; lane F's eval_gates also claims 0043 and merges first, so this is regenerated as 0044 after it (agreed with lanes a/c/f).

## User Scenarios
- **US1** An admin sets (or clears) who a person reports to, over REST (`POST /api/users`, `PUT /api/users/[id]` with `managerId`; `GET` returns it) or from the Teams page's Reports to drawer.
- **US2** A reporting loop (A → B → A, or longer) is refused with a 422 that names the loop. So are self, an unknown person and someone in another organization.
- **US3** The team page shows each member's manager, and for the team's owner lists their direct reports, marking those outside this team.

## Requirements
- **FR-001** `users.manager_id` is nullable; same organization and not self are enforced in the application (an FK cannot prove the tenant).
- **FR-002** Changing a manager is an admin action and an audit event (`user.updated` before/after, `user.created` includes `managerId`).
- **FR-003** `listUsers` and `getUser` return `managerId`; existing callers that omit it are unchanged.
- **FR-004** Policy and objective inheritance still follow the team tree, not the manager chain.
- **FR-005** The Reports to control is admin-only and records the reporting line only; the person's team does not change.
