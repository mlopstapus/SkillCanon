# Implementation Plan: Skill Sharing — Subscribe & Fork

**Branch**: `020-prompt-sharing` | **Date**: 2026-07-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-prompt-sharing/spec.md`

## Summary

Port skill sharing into the `prompt-registry` bounded context as a single universal mechanism — **subscribe** (a live reference that always resolves the source's current active version) and **fork** (an independent copy under a new owner, with a `forked_from_skill_id` lineage pointer) — usable symmetrically whether the source or recipient is a user or a team, per [PDR-016](../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md). Introduces a new `prompt_registry.subscriptions` table and two new application services (`subscribeSkill`/`unsubscribeSkill`, `forkSkill`), and splits the existing `listPrompts` into two distinct queries: a narrower **accessible** set (owned + own team's + subscribed — what `listPrompts` becomes) and a new, broader **discoverable** set (every skill in the org, independent of any relationship to it — `listSkillsByOrganization`, reusing the existing unfiltered `listPromptsByOrg` repo query as-is). Follows the established `domain → infrastructure → application` layering already used by `project`/`prompt` in this same bounded context.

## Technical Context

**Language/Version**: TypeScript 5.x (same as rest of codebase, Node.js 20)

**Primary Dependencies**: Drizzle ORM (postgres-js), Vitest, `@/shared/db` helpers (`id`, `organizationId`, `timestamps`, `withAudit`, `withTenantContext`), `@/bcs/audit-compliance` (`record`, `DEFAULT_WEB_AUDIT_CONTEXT`, `AUDIT_ACTION_VERBS`), `@/bcs/identity-access` (`getUser`, `getTeam` — for organization/owner validation and the org-admin-or-team-owner authorization rule)

**Storage**: PostgreSQL — `prompt_registry` schema (already exists). One new table: `subscriptions`. No schema change to `prompts` (owner_type/owner_id/forked_from_skill_id already landed via PDR-016's migration 0016).

**Testing**: Vitest with integration tests against a real Testcontainers-backed test database (same pattern as `create-prompt.test.ts`)

**Target Platform**: Linux server (Next.js API / service layer)

**Project Type**: Service library (no HTTP routes or UI in this feature — application service functions only, per spec's explicit out-of-scope declaration)

**Performance Goals**: Same as existing prompt-registry services; no additional latency targets for this feature

**Constraints**: A fork must never re-sync with its source after creation — no background job, no lazy re-check, nothing. A subscription must always resolve the source's *current* active version at read time — no cached/denormalized copy of the version pointer. Must not cross bounded-context boundaries (no direct imports from `identity-access` internals — only its exposed contract functions).

**Scale/Scope**: Same organization scale as existing prompt-registry tables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| P1 — Test-First Development | ✅ PASS | Integration tests written alongside each application function; negative cross-org tests included per Constitution IV |
| D1 — Domain-Driven Bounded Contexts | ✅ PASS | All code lives in `src/bcs/prompt-registry/`; Identity/Access consumed only through its exposed contract (`getUser`, `getTeam`) — no internal imports |
| D2 — Domain Invariants in Domain Layer | ✅ PASS | Errors, types, and the "no owner-reassignment operation exists" invariant declared in `domain/subscription.ts` (new) and enforced by application services, not re-derived per caller |
| M1/M2/M3 — Multi-Tenant Isolation | ✅ PASS | Every query scoped by `organizationId`; negative cross-org test per new resource type (`subscriptions`); `withTenantContext` used for all queries |
| S1/S2/S3 — Secure by Default | ✅ PASS | No secrets involved; no template rendering in this feature |
| C1/C2 — Auditable (SOC2) | ✅ PASS | `SkillSubscribed`/`SkillUnsubscribed`/`SkillForked` written via `withAudit`, same pattern as every other mutation in this BC |

G1 (Feature-Gated by Entitlement) is not applicable here, consistent with `018-prompt-version-model`'s own Constitution Check: G1 gates "a UI surface, a REST route, an MCP tool" — this feature adds only internal application-layer service functions, with no route or UI in scope (per spec Assumptions). Entitlement gating, if any, belongs to whichever future feature (epic 008) wires these into a route.

## Project Structure

### Documentation (this feature)

```text
specs/020-prompt-sharing/
├── plan.md          ← this file
├── research.md      ← Phase 0 output
├── data-model.md     ← Phase 1 output
├── quickstart.md     ← Phase 1 output
├── tasks.md          ← Phase 2 output (/speckit-tasks — not created here)
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/bcs/prompt-registry/
├── domain/
│   ├── project.ts                        (existing)
│   ├── prompt.ts                         (existing — owner_type/owner_id/forked_from_skill_id already added by PDR-016)
│   └── subscription.ts                    ← NEW: Subscription type, SubscriberType, errors
├── infrastructure/
│   ├── schema.ts                          ← EXTEND: add `subscriptions` table
│   ├── prompts-repo.ts                    ← EXTEND: add owner/subscription-join query for the accessible set
│   ├── subscriptions-repo.ts              ← NEW: subscription table queries
│   └── (projects-repo.ts, project-members-repo.ts, prompt-versions-repo.ts — existing, unchanged)
├── application/
│   ├── authorize-owner-action.ts           ← NEW: shared org-admin-or-team-owner authorization helper (research.md §2)
│   ├── subscribe-skill.ts                 ← NEW
│   ├── subscribe-skill.test.ts            ← NEW
│   ├── unsubscribe-skill.ts               ← NEW
│   ├── unsubscribe-skill.test.ts          ← NEW
│   ├── fork-skill.ts                      ← NEW
│   ├── fork-skill.test.ts                 ← NEW
│   ├── list-skills-by-organization.ts     ← NEW: the "discoverable" set (org-wide, unfiltered)
│   ├── list-skills-by-organization.test.ts ← NEW
│   ├── list-prompts.ts                    ← REWRITE: becomes the "accessible" set (owned + own team + subscribed)
│   ├── list-prompts.test.ts               ← REWRITE
│   ├── subscription-test-helpers.ts       ← NEW: shared test fixtures (mirrors prompt-test-helpers.ts)
│   └── (create-prompt.ts, publish-version.ts, etc. — existing, unchanged)
├── index.ts                               ← EXTEND: re-export new public API
└── CONTRACT.md                            ← EXTEND: add subscribeSkill/unsubscribeSkill/forkSkill/listSkillsByOrganization rows (already stubbed by PDR-016; this feature fills in what's actually implemented)

src/bcs/audit-compliance/
└── domain/audit-event.ts                  ← EXTEND: add `subscribed`/`unsubscribed`/`forked` to AUDIT_ACTION_VERBS + AUDIT_ACTION_VERB_COLORS (same pattern as 018 adding `published`)
```

**Structure Decision**: Follows the existing `prompt`/`project` pattern 1:1 — `domain/` for types and errors, `infrastructure/` for table definitions and raw queries, `application/` for business logic and tests. No `contracts/` directory — this is a purely internal library feature with no external interface (route/UI), matching `018-prompt-version-model`'s precedent of skipping that artifact for the same reason.

## Complexity Tracking

No constitution violations. One deliberate behavior change flagged for visibility, not a violation: `listPrompts`'s existing behavior (today, org-wide unfiltered) is repurposed to the narrower "accessible" set, per `bcs/prompt-registry/CONTRACT.md`'s already-committed signature. Its current org-wide behavior moves to a new, separate function (`listSkillsByOrganization`) rather than being lost — verified via `grep` that `listPrompts` has no callers outside its own test file, so this is safe to change now, before any consumer depends on the old behavior.
