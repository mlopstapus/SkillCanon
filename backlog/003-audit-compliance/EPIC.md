# Epic 003: Audit & Compliance

**Priority:** 3
**Status:** in-progress (item 001's schema/write-path pulled forward ahead of this epic's normal sequencing — see Notes)
**Goal:** Build the immutable audit log and the transactional write path every subsequent bounded context will call into, so audit coverage is complete from the first mutation onward rather than retrofitted later.

## Overview

Built deliberately early — right after Identity & Access, before Governance, Prompt Registry, or Workflow Orchestration exist — because every mutation those contexts add needs `withAudit()` (built in epic 001) to have somewhere real to write to. This directly satisfies tenet C1 (every mutation captured, on every transport) and closes the gap the tenets doc calls out explicitly: the current `mcp/tools.py`'s `sh_run` never calls `record_usage` while the REST path does. In the new architecture, that gap is structurally prevented — `withAudit()` is the only sanctioned way to mutate, not an opt-in.

## Features

- [x] [001 - Audit Event Schema & Write Path](archive/001-audit-event-schema-and-write-path.md)
- [x] [002 - Audit Query & Retention](archive/002-audit-query-and-retention.md)
- [x] [003 - Audit Log UI](archive/003-audit-log-ui.md)

*Completed features are moved to `archive/` and checked off here.*

## Dependencies

- `backlog/002-identity-access/EPIC.md` (needs org/user identifiers to attribute events to)
- `backlog/001-typescript-refactor-foundation/002-drizzle-shared-db-kernel.md` (the `withAudit()` wrapper shell was built there; this epic implements what it writes to)

## Notes

Feature 002's retention logic depends on `resolveEntitlements()`, which doesn't exist until epic 009 — build it against a hardcoded Free-tier default (per `bcs/billing-entitlements/OWNERSHIP.md`'s self-host note) and wire in the real entitlement call once epic 009 lands, rather than blocking this epic on billing.

**Sequencing exception (2026-07-23)**: `002-identity-access/008-jwt-session-auth` (still within epic 002, not after it) needed a real audit write path *now* — for login/logout audit events — rather than waiting for this epic to start per its normal "right after Identity & Access [fully finishes]" sequencing. Rather than block that feature or build a throwaway parallel audit mechanism, it pulled item 001's schema/`record()`/redaction/index requirements forward and completed them directly (see that feature's plan.md Complexity Tracking and `001-audit-event-schema-and-write-path.md`, still `status: open`). Item 001's retrofit requirement (wrapping already-shipped epic-002 mutations in `withAudit()`) is untouched and remains this epic's own work whenever it formally starts. New gap surfaced by this: `audit.audit_events` has no RLS policy yet and no existing backlog item owns adding one for the `audit` schema.

**Second, larger sequencing exception (2026-07-23)**: an explicit decision to have the real, visually-finished audit trail UI in place by the end of *this* epic — not a functional-placeholder-now/restyle-later approach — means `003-audit-log-ui.md` pulled forward two chunks of scope that didn't have a home yet at the time: a minimal app shell/nav and the page's actual visual design, both built directly from the Claude design mockup `SkillCanon Audit.dc.html` (project `7babdbf3-c063-46b5-84df-ffa9f588d88a`, accessible via the `claude_design` MCP server). This also newly required wiring session auth into a Next.js route/middleware for the first time in this codebase.

**Third, follow-on structural change (2026-07-23)**: this pull-forward generalized into a standing pattern — every epic with a UI component now gets its own real, finished UI feature the same way, rather than deferring visual design to a separate later redesign epic. The backlog was restructured accordingly: a new `004-app-shell-and-landing` epic now owns the real app shell/nav and design tokens, the former "Distribution" epic is renumbered `008-distribution` with its shell-building responsibility removed, and the former "UI Redesign" epic is renumbered and shrunk to `010-ui-polish-and-accessibility` (per-page redesign work distributed into each page's owning epic — see that epic's `EPIC.md` for the full redistribution record).

**Fourth, sequencing flip (2026-07-23)**: `004-app-shell-and-landing` is now being implemented *before* this epic's remaining items (002/003) finish, not after — since nothing about the shell/tokens actually needs this epic done first, going in that order means `003-audit-log-ui.md` never has to build (or later throw away) its own standalone shell/tokens at all; it now just depends on and composes into the real ones directly (see that feature's updated Technical Notes and `004-app-shell-and-landing/EPIC.md`'s own Notes).
