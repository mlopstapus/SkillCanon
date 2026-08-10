---
epic: 003-audit-compliance
feature: 002-audit-query-and-retention
status: done
dependencies: ["001-audit-event-schema-and-write-path.md"]
---

# Audit Query & Retention

Implement `list()` and `export()` per `bcs/audit-compliance/CONTRACT.md`, gated by the caller's entitlement-resolved retention window, plus the scheduled pruning job that enforces retention.

## Requirements

- [x] `list(orgId, filters, { requestingUserId })`: paginated query over `audit_events`, filtered to the org's retention window
- [x] `filters` must support (per the `003-audit-log-ui.md` mockup's filter bar): free-text search across `action`/`resourceType`/`resourceId`/actor name, `resourceType` equality, actor equality (`actorUserId` or `actorApiKeyId`), `transport` equality, and a `createdAt` date range — the UI's search/Resource/Actor/date-range controls all need a corresponding query-layer filter, not just a client-side narrow of one unfiltered page
- [x] `export(orgId, format)`: bulk export (CSV/JSON), gated by an entitlement flag (Enterprise-tier feature per the original tier strawman, subject to whatever `context/entitlements.md` finalizes)
- [x] Retention pruning: scheduled job deletes `audit_events` rows older than the org's `auditRetentionDays` entitlement
- [x] **New (2026-07-23, driven by the `SkillCanon Audit.dc.html` mockup):** the retention-pruning job records its own run as an `audit.pruned` event (`actorUserId`/`actorApiKeyId` both null, `transport: "system"`, `resourceType: "user"` or similar, `after: { deleted: <count> }`) — the mockup depicts the pruning job as a first-class row in the trail, not a silent background operation
- [x] Until epic 009 (Billing & Entitlements) exists, both retention and export gating use a hardcoded Free-tier default rather than a live `resolveEntitlements()` call — swapped for the real call once epic 009 lands. **Correction (2026-07-23):** the hardcoded default must be **7 days**, matching `context/entitlements.md`'s actual Free-tier `auditRetentionDays` value — the mockup's footer copy ("retention 90 days (Free)") has the Paid-tier number under the Free label; `003-audit-log-ui.md` must render whatever `list()`/the hardcoded default actually resolves to, not copy that string literally

## Acceptance Criteria

- [x] `list()` never returns another organization's events (covered by this BC's own tenant-isolation test, following the epic-002 pattern)
- [x] Each of `list()`'s filter dimensions (search, resource type, actor, transport, date range) narrows results correctly, alone and combined
- [x] Pruning job removes events older than the configured retention window and leaves newer ones untouched, and writes exactly one `audit.pruned` row per run recording the deleted count
- [x] `export()` is rejected for an org without the export entitlement (using the hardcoded default until epic 009)

## Open Questions

- Export format(s) — CSV only, or also JSON/SIEM-friendly format for larger Enterprise customers? Defer to whoever's evaluating actual Enterprise deals; not blocking for launch.

## Dependencies

- `001-audit-event-schema-and-write-path.md`
- `backlog/000-foundations/archive/007-entitlement-catalog.md` (for the `auditRetentionDays` default value to hardcode initially — Free: 7 days)

## Technical Notes

The temporary hardcoded-entitlement approach here is intentional, not a shortcut to revisit reluctantly — it's explicitly how `bcs/billing-entitlements/OWNERSHIP.md` says self-hosted installs are supposed to work (Free defaults, no live billing dependency), so this feature is correct as-is for self-host even before epic 009 exists. The swap to a live `resolveEntitlements()` call is only needed for the SaaS path.


## Completion Notes

Implemented in `src/bcs/audit-compliance` with `listAuditEvents`, `exportAuditEvents`, and `pruneAuditEvents`. The temporary entitlement behavior is the specified Free default: 7-day retention and no export entitlement, so export fails closed until epic 009 supplies live entitlement resolution. Actor display-name search is covered through the Identity & Access public `listUsers` contract.
