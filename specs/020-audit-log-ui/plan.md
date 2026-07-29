# Implementation Plan: Audit Log UI

**Branch**: `020-audit-log-ui` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-audit-log-ui/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Build the real `settings/audit-log` page: an admin-only, paginated, filterable (search, resource type, actor, transport, date range) view over `listAuditEvents()`, with a detail drawer showing a redacted before/after diff, ported from the `SkillCanon Audit.dc.html` Claude Design mockup into the existing Next.js/React/Tailwind app shell. Four gaps identified during clarification are resolved as real, in-scope work rather than literal mockup ports: (1) resource display names are resolved live per-row from each owning bounded context (no denormalized name exists on `AuditEvent`), falling back to the raw id; (2) a Transport filter dropdown is added beyond the mockup's literal markup; (3) the mockup's non-functional date-range label becomes a real presets+custom-range control; (4) the Actor filter lists every distinct actor in retained history, not just currently-active members.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 16 (App Router), React 19

**Primary Dependencies**: Drizzle ORM (`postgres-js` driver), Tailwind v4 (`@theme inline`, no `tailwind.config.ts`), `src/shared/ui` (Badge, Table, `cn()`), `src/bcs/audit-compliance` (`listAuditEvents`, domain types, new resolver), `src/bcs/identity-access` (`authenticateSession`, `getTeam`, `getUser`, plus two new thin getters — `getInvitation`, `getApiKeySummary`), `src/bcs/governance` (`getPolicy`, `getObjective`), `src/bcs/prompt-registry` (`getProject`, plus two new thin getters — `getPromptById`, `getPromptVersion`), `src/bcs/billing-entitlements` (`resolveEntitlements` — corrected dependency found during `/speckit-analyze`, replaces reliance on `audit-compliance`'s own disconnected entitlement stub for retention days)

**Storage**: PostgreSQL via the existing `audit.audit_events` table (append-only, RLS-protected); no new tables — read-only feature

**Testing**: Vitest (`renderToStaticMarkup`-only convention for React components per this repo's established pattern — no jsdom/click-simulation); `pnpm vitest run specs/020-audit-log-ui` equivalent path under `src/app/(app)/settings/audit-log`

**Target Platform**: Server-rendered Next.js App Router page within the existing `(app)` route group, self-hosted via Docker Compose or deployed per the existing CI/CD pipeline

**Project Type**: Web application — single unified Next.js app (per `docs/context/repo-structure.md`); no separate frontend/backend split

**Performance Goals**: Page interactions (filter changes, drawer open) should feel instant against the existing `listAuditEvents` pagination (`DEFAULT_AUDIT_PAGE_SIZE = 50`, `MAX_AUDIT_PAGE_SIZE = 200`); no new performance envelope beyond what the existing query layer already provides

**Constraints**: Admin-only access enforced server-side (not just hidden UI); redacted fields (`password_hash`, `key_hash`, raw tokens — already stripped by `record()`) must never render in the diff view; resource-name resolution must go through each owning BC's public barrel only (module-boundary lint rule), never that BC's internal `application/`/`infrastructure/` modules directly

**Scale/Scope**: One settings page (list + filter bar + detail drawer), one resource/actor-name-resolution helper in `audit-compliance` composing four existing BCs' public getters (four of which are small new thin wrappers around already-existing infra finders — `getInvitation`, `getApiKeySummary`, `getPromptById`, `getPromptVersion`), one new fully-internal `audit-compliance` query (`listDistinctAuditActors`), no schema changes, no new bounded context

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution (`/.specify/memory/constitution.md`) predates the TypeScript rewrite and describes the legacy Python/FastAPI stack, but states its principles apply "regardless of implementation language." Evaluated against the current codebase's actual TypeScript conventions:

- **I. Test-First (P1)**: This repo's TS rewrite substitutes `pnpm test`/Vitest coverage for the legacy no-type-checker rationale, but the spirit (tests as the correctness signal) still applies. Plan: write/extend tests alongside each task, not after, per `tasks.md`.
- **II. Domain-Driven Bounded Contexts (D1)**: Satisfied by construction — this feature composes `audit-compliance`, `identity-access`, `governance`, and `prompt-registry` exclusively through their public barrels (`@/bcs/<name>`), never internal modules, matching this repo's `eslint-plugin-boundaries` enforcement.
- **III. Domain Invariants in Domain Layer (D2)**: No new business rule is introduced here beyond what `listAuditEvents`/`record()` already enforce (redaction, retention cutoff); this feature is read/presentation-only.
- **IV. Multi-Tenant Isolation (M1-M3)**: `listAuditEvents(db, organizationId, ...)` is already org-scoped and RLS-protected (`audit.audit_events` per `011-tenant-isolation-rls`); this page passes the signed-in admin's own `orgId` — no path/body-supplied org id is ever trusted. Resource-name resolution calls (`getTeam`, `getPolicy`, etc.) are likewise called with the same org id, never a caller-supplied one.
- **V. Secure by Default (S1-S3)**: Redaction is already handled by `record()`; this feature's job is to *not undo* it, which FR-010/SC-002 make an explicit, testable requirement.
- **VI. Auditable & Compliant (C1-C2)**: This feature *is* the audit-compliance UI surface — no additional audit-of-audit-log-views requirement exists in the spec, matching this BC's own contract ("Query/export access is gated by entitlement," not itself separately audited).
- **VII. Feature-Gated by Entitlement (G1)**: **Corrected during `/speckit-analyze` (finding C1)** — `listAuditEvents` previously only called `audit-compliance`'s own internal, disconnected `resolveAuditEntitlements()` stub (hardcoded `{ auditRetentionDays: 7, canExportAuditEvents: false }`), not the real `billing-entitlements` bounded context that already exists and whose own `CONTRACT.md` already lists "Audit & Compliance" as an intended consumer of `resolveEntitlements(orgId)`. This feature adds `resolveAuditEntitlementsForOrg(organizationId)` in `audit-compliance/application/` that calls the real `billing-entitlements.resolveEntitlements(orgId)` for `auditRetentionDays` (keeping `canExportAuditEvents` hardcoded `false`, since no export-specific key exists yet in `EntitlementSnapshot`), and threads it through `list.ts`/`export.ts`/`prune.ts` in place of the old stub. Behavior is unchanged today (both resolve to the same Free default), but the gate is now real, satisfying G1 properly rather than via a same-BC-only stub. Export (FR-014) remains hidden entirely until a real export-specific entitlement key exists, per the spec's (corrected) Assumptions.

**Result**: PASS. No violations requiring Complexity Tracking justification.

**Post-design re-check** (after Phase 1): The four new getters added to `identity-access`/`prompt-registry` (data-model.md) are exported through each BC's own public barrel and documented in that BC's `CONTRACT.md` in the same change, preserving D1. The one new fully-internal `audit-compliance` query (`listDistinctActors`) never crosses a BC boundary. No schema/migration touches RLS-protected tables (M1-M3 unaffected — reads only, already-org-scoped). Still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/020-audit-log-ui/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── audit-log-ui.contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── app/(app)/settings/audit-log/
│   ├── page.tsx                    # Server component: session auth, admin gate, initial query, filter params from searchParams
│   ├── audit-log-view.tsx          # Client "View" component (filters, row list, pagination) — pure props in, per this repo's View/wrapper split convention
│   ├── audit-log.tsx               # Thin client wrapper: owns router/searchParams hook, passes state down to *View
│   ├── event-detail-drawer.tsx     # Client component: slide-in drawer, diff rendering, redaction-safe
│   ├── filter-bar.tsx              # Client component: search input, Resource/Actor/Transport dropdowns, date-range control
│   ├── actions.ts                  # Server actions: fetchAuditEventsAction (filters → AuditEventPage), used by client for re-fetch on filter change
│   └── *.test.tsx                  # renderToStaticMarkup tests per component, following this repo's existing convention
│
├── bcs/audit-compliance/
│   ├── application/resolve-resource-display-name.ts   # New: resourceType/resourceId → name, composing other BCs' public getters; raw-id fallback (only `project_member` needs it)
│   ├── application/resolve-actor-display-name.ts       # New: actorUserId/actorApiKeyId → name, reusing getUser/getApiKeySummary; "system" when both null
│   ├── application/list-distinct-actors.ts             # New: distinct (actorUserId, actorApiKeyId) pairs within retention — fully internal to this BC, powers the Actor filter's option list
│   ├── application/resolve-audit-entitlements-for-org.ts  # New (added post-analyze, finding C1): real org-scoped entitlement resolution via billing-entitlements, replacing list.ts/export.ts/prune.ts's old calls to the domain's disconnected stub
│   ├── infrastructure/audit-events-repo.ts             # +listDistinctActors query (extends existing file)
│   └── *.test.ts for each new file above (plus updated list.test.ts/export.test.ts/prune.test.ts for the new async, org-scoped entitlement call)
│
├── bcs/identity-access/
│   ├── application/get-invitation.ts        # New thin getter wrapping existing invitations-repo.findByOrgAndId
│   ├── application/get-api-key-summary.ts   # New thin getter wrapping existing api-keys-repo.findByOrgAndId
│   ├── index.ts                             # +2 new exports (update alongside CONTRACT.md's Exposed APIs table)
│   └── CONTRACT.md                          # Document the 2 new getters
│
├── bcs/prompt-registry/
│   ├── application/get-prompt-by-id.ts   # New thin getter wrapping existing prompts-repo.findPromptByOrgAndId
│   ├── application/get-prompt-version.ts # New thin getter wrapping existing prompt-versions-repo.findVersionById
│   ├── index.ts                          # +2 new exports (update alongside CONTRACT.md's Exposed APIs table)
│   └── CONTRACT.md                       # Document the 2 new getters
```

**Structure Decision**: Single unified Next.js app (no frontend/backend split — this repo's root-level TypeScript scaffold already covers both). The page and its client components live under `src/app/(app)/settings/audit-log/`, following the exact `page.tsx` (server) → `*-list.tsx`/`*-explorer.tsx` (client, View/wrapper split) pattern already established by `settings/api-keys` and `teams`. The new *business* logic (resource/actor-name resolution, distinct-actor listing) lives in `src/bcs/audit-compliance/application/`, since it composes cross-BC public APIs and belongs in the bounded context that owns `AuditEvent` presentation concerns (D1). The four small new getters in `identity-access`/`prompt-registry` are same-shape wrappers around id-based finders that already exist in each BC's own `infrastructure/` layer — completing an already-established `getX` pattern, not introducing a new one — and each BC's `CONTRACT.md` is updated in the same change per this repo's own established convention for keeping a barrel's exports matched to its contract doc.

## Complexity Tracking

> No Constitution Check violations — this section is intentionally empty.
