# Feature Specification: Feedback Intake

**Feature Branch**: `feat/feedback-intake`
**Created**: 2026-10-30
**Source**: `backlog/016-skill-feedback/002-feedback-intake.md`. **Depends on** 016/001 (PR #105: serve ids).

## User Scenarios & Testing

### User Story 1 - Tell the owner how a serve went (P1)
After running a skill, a person or agent files a thumbs up/down and/or a note against the serve id they were given.
1. **Given** a serve in my organization, **When** I file `{kind: "signal", rating: "down"}`, **Then** it is stored against that serve and an audit event is written.
2. **Given** a note with text, **When** filed, **Then** it is stored (optionally with a rating).
3. **Given** a note with no text, or a signal with no rating, **Then** 422.
4. **Given** a serve id outside my organization, unknown, or malformed, **Then** 404 (indistinguishable).

### User Story 2 - Same from MCP and the CLI (P1)
MCP tool `sh-feedback` and CLI `skillcanon feedback <serveId> --up|--down [--note "..."]` file the same record.

## Requirements
- **FR-001** `POST /api/feedback` body `{serveId, kind: "signal"|"note", rating?: "up"|"down", text?}` -> 201 with the stored feedback.
- **FR-002** `signal` requires `rating`; `note` requires non-empty `text` (<= 4000 chars); `rating` optional on a note.
- **FR-003** The row stores serve id, author, kind, rating, text, time; never a copy of skill text.
- **FR-004** Every filing writes an audit event (`feedback.created`, resource `feedback`).
- **FR-005** MCP `sh-feedback` (`serve_id`, `kind?`, `rating?`, `text?`); kind defaults to `note` when text is given, else `signal`.
- **FR-006** CLI: `--up`/`--down` set the rating; `--note` adds text (kind `note`, else `signal`); the argument may be a serve id or a slug recorded by `run`.
- **FR-007** Table `distribution.feedback` is tenant-isolated (RLS, same pattern as `prompt_usage`).

## Assumptions
- Any member of the serve's organization may file against it (per backlog: 404 only outside the org).
- Editing/deleting feedback is out of scope. Owner triage is 016/003.
