# Feature Specification: Feedback in the Skill Page

**Feature Branch**: `feat/feedback-in-skill-page`
**Created**: 2026-10-30
**Source**: `backlog/016-skill-feedback/003-feedback-in-skill-page.md`. **Depends on** 016/002 (PR #106) and 016/001 (PR #105).

## User Scenarios & Testing

### User Story 1 - See feedback where I edit the skill (P1)
A skill page has a "Feedback" tab showing, per version, counts of up, down and notes, then notes newest first, each naming its version and serve and linking to that serve.
1. **Given** feedback on versions 1 and 2, **Then** the tab lists a row per version with up/down/notes counts.
2. **Given** several notes, **Then** newest is first and shows rating, author, time, text and the serve id linking to `/api/serves/<id>`.
3. **Given** no feedback, **Then** an empty state is shown.

### User Story 2 - Close the loop (P1)
The skill's owner (user owner, team owner, or org admin) marks a note addressed and links the version that addressed it. Non-owners see addressed state but no control.

### User Story 3 - Spot a failing skill in the list (P2)
The skills list has a "Down-rate" column for the active version: down ratings / rated feedback (up + down) for serves of that version, with the counts; "—" when no ratings yet.

## Requirements
- **FR-001** Feedback tab on template and chain skills; per-version counts (up, down, notes) and a newest-first note list, org-scoped.
- **FR-002** `markFeedbackAddressed(db, actor, feedbackId, versionId)` — owner-only (NotAuthorizedError otherwise), the version must belong to the same skill, feedback must be a note in the actor's org (cross-org = not found); writes a `feedback.updated` audit event; re-marking replaces the link.
- **FR-003** Columns `addressed_at`, `addressed_in_version_id` on `distribution.feedback` (migration 0035).
- **FR-004** Down-rate for the active version = down / (up + down) over rated feedback on serves of that version.
- **FR-005** The Feedback panel is always rendered in the DOM and shown by the active tab (keeps the view testable).

## Assumptions
- Only notes can be marked addressed (signals are counted, not triaged).
- REST/MCP triage endpoints are out of scope; the UI uses a server action.
- Note authors are shown by display name resolved from users.
