# Implementation Plan: Project Skill Assignment

**Branch**: `022-project-skill-assignment` | **Date**: 2026-07-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-project-skill-assignment/spec.md`

## Summary

Adds project-scoped skill assignment (required/optional) to the `prompt-registry` bounded context, per [PDR-016](../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md): a project may only assign a skill already owned by one of its **participating teams** (its owner team or a collaborator team), never a personal skill directly. `listRequiredSkillsForProject` is a flat, direct read (no team-chain resolution) that VCS Integration's future PR check reads. `listPrompts` gains an optional `projectId` filter so a project member's accessible-skill set also includes everything assigned to that project, regardless of which participating team contributed it.

Per `/speckit-clarify`'s resolution (spec.md Clarifications), this feature also implements the **collaborator-team** capability (`project_teams`: add/remove collaborator team, both invariants, owner-or-collaborator project listing) pulled forward from `backlog/006-prompt-registry/001-project-model-and-membership.md`, which had not been built — this feature's own acceptance criteria are untestable without it.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20)

**Primary Dependencies**: Drizzle ORM (postgres-js), Vitest, `@/shared/db` helpers (`id`, `organizationId`, `timestamps`, `withAudit`), `@/bcs/audit-compliance` (`record`, `DEFAULT_WEB_AUDIT_CONTEXT`), `@/bcs/identity-access` (`getUser`, `getTeam` — exported `UserSummary` type for the org-admin-or-team-owner authorization check)

**Storage**: PostgreSQL — `prompt_registry` schema (already exists). Two new tables: `project_teams`, `project_skill_assignments`. No change to `projects` or `prompts`.

**Testing**: Vitest with integration tests against a real Testcontainers-backed test database (same pattern as `create-project.test.ts`/`subscribe-skill.test.ts`)

**Target Platform**: Linux server (Next.js API / service layer)

**Project Type**: Service library (no HTTP routes or UI in this feature — application service functions only; matches `018-prompt-version-model`'s and `020-prompt-sharing`'s precedent of leaving routes to epic 008)

**Performance Goals**: Same as existing prompt-registry services; no additional latency targets

**Constraints**: A project's owner team is never itself a row in `project_teams` (its participation is `projects.team_id`) — every eligibility/listing check must union the owner team in alongside the collaborator-team rows, never rely on `project_teams` alone. Skill-assignment eligibility must reject personal (`ownerType: "user"`) skills unconditionally, even when the acting user is both the skill's owner and the project's administrator.

**Scale/Scope**: Same organization scale as existing prompt-registry tables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| P1 — Test-First Development | ✅ PASS | Integration tests written alongside each application function; negative cross-org and authorization tests included per Constitution IV |
| D1 — Domain-Driven Bounded Contexts | ✅ PASS | All code lives in `src/bcs/prompt-registry/`; Identity/Access consumed only through its exposed contract (`getUser`, `getTeam`) — no internal imports |
| D2 — Domain Invariants in Domain Layer | ✅ PASS | New types/errors declared in `domain/project-team.ts` and `domain/project-skill-assignment.ts` (new); eligibility and invariant checks live in application services, not re-derived per caller |
| M1/M2/M3 — Multi-Tenant Isolation | ✅ PASS | Every query scoped by `organizationId`; negative cross-org test per new resource type (`project_teams`, `project_skill_assignments`) |
| S1/S2/S3 — Secure by Default | ✅ PASS | No secrets involved; no template rendering in this feature |
| C1/C2 — Auditable (SOC2) | ✅ PASS | `ProjectSkillAssigned`/`ProjectSkillUnassigned` and collaborator-team add/remove events written via `withAudit`, same pattern as every other mutation in this BC |

G1 (Feature-Gated by Entitlement) is not applicable here, consistent with `018-prompt-version-model`'s and `020-prompt-sharing`'s own Constitution Checks: G1 gates "a UI surface, a REST route, an MCP tool" — this feature adds only internal application-layer service functions, with no route or UI in scope (per spec Assumptions). Entitlement gating, if any, belongs to whichever future feature (epic 008) wires these into a route.

## Project Structure

### Documentation (this feature)

```text
specs/022-project-skill-assignment/
├── plan.md          ← this file
├── research.md      ← Phase 0 output
├── data-model.md    ← Phase 1 output
├── quickstart.md    ← Phase 1 output
├── tasks.md         ← Phase 2 output (/speckit-tasks — not created here)
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/bcs/prompt-registry/
├── domain/
│   ├── project.ts                              (existing — unchanged)
│   ├── project-team.ts                         ← NEW: ProjectTeam type, AddCollaboratorTeamParams, errors
│   ├── project-skill-assignment.ts             ← NEW: ProjectSkillAssignment type, AssignSkillToProjectParams, errors
│   ├── prompt.ts                                (existing — unchanged)
│   └── subscription.ts                          (existing — `assertAuthorizedForOwner`'s error types reused, not duplicated)
├── infrastructure/
│   ├── schema.ts                                ← EXTEND: add `projectTeams`, `projectSkillAssignments` tables
│   ├── projects-repo.ts                         ← EXTEND: `listByTeam` matches owner OR collaborator team
│   ├── project-teams-repo.ts                    ← NEW: collaborator-team table queries
│   ├── project-skill-assignments-repo.ts        ← NEW: assignment table queries, incl. required-skill-names join
│   ├── prompts-repo.ts                          ← EXTEND: project-assigned-skills query for the `listPrompts` projectId filter
│   └── (project-members-repo.ts, prompt-versions-repo.ts, subscriptions-repo.ts — existing, unchanged)
├── application/
│   ├── authorize-owner-action.ts                 (existing — reused as-is for the owner-team-admin check on a project's `teamId`)
│   ├── add-collaborator-team.ts                 ← NEW
│   ├── add-collaborator-team.test.ts            ← NEW
│   ├── remove-collaborator-team.ts              ← NEW
│   ├── remove-collaborator-team.test.ts         ← NEW
│   ├── list-project-teams.ts                    ← NEW (participating-teams read, exposed per CONTRACT.md)
│   ├── list-project-teams.test.ts               ← NEW
│   ├── assign-skill-to-project.ts               ← NEW
│   ├── assign-skill-to-project.test.ts          ← NEW
│   ├── unassign-skill-from-project.ts           ← NEW
│   ├── unassign-skill-from-project.test.ts      ← NEW
│   ├── list-required-skills-for-project.ts      ← NEW
│   ├── list-required-skills-for-project.test.ts ← NEW
│   ├── list-projects.ts                         ← UNCHANGED (already delegates to `listByTeam`, which gains owner-or-collaborator matching underneath)
│   ├── list-prompts.ts                          ← REWRITE: optional `projectId` parameter
│   ├── list-prompts.test.ts                     ← EXTEND
│   ├── project-team-test-helpers.ts             ← NEW: shared fixtures (mirrors subscription-test-helpers.ts)
│   └── (create-project.ts, update-project.ts, etc. — existing, unchanged)
├── index.ts                                      ← EXTEND: re-export new public API
└── CONTRACT.md                                   ← EXTEND: `assignSkillToProject`/`unassignSkillFromProject`/`addCollaboratorTeam`/`removeCollaboratorTeam`/`listProjectTeams` rows already stubbed by PDR-016 with an `actingUserId: string` signature; update to the real `actingUser: UserSummary` shape actually implemented (matching how `020-prompt-sharing` updated `subscribeSkill`'s row the same way)

src/bcs/audit-compliance/
└── domain/audit-event.ts                        ← EXTEND: add `skill.assigned`/`skill.unassigned`/`collaborator_team.added`/`collaborator_team.removed` to `AUDIT_ACTION_VERBS` + `AUDIT_ACTION_VERB_COLORS` (same pattern as 018 adding `published`, 020 adding `subscribed`/`unsubscribed`/`forked`)

drizzle/migrations/
├── 0018_prompt_registry_project_teams.sql             ← NEW
└── 0019_prompt_registry_project_skill_assignments.sql ← NEW
```

**Structure Decision**: Follows the existing `project`/`prompt`/`subscription` pattern 1:1 — `domain/` for types and errors, `infrastructure/` for table definitions and raw queries, `application/` for business logic and tests. No `contracts/` directory — this is a purely internal library feature with no external interface (route/UI), matching `018-prompt-version-model`'s and `020-prompt-sharing`'s precedent of skipping that artifact for the same reason. `authorize-owner-action.ts`'s existing org-admin-or-team-owner check is reused unmodified for the project's owner-team-admin authorization rule (same underlying rule, different caller) rather than duplicated.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. One deliberate scope expansion flagged for visibility, matching this repository's established precedent for a feature completing part of a not-yet-built dependency when it has a real, immediate need (see `CLAUDE.md`'s notes on `008-jwt-session-auth` pulling forward part of `003-audit-compliance`, and `020-prompt-sharing`'s own re-specification after PDR-016): this feature implements `backlog/006-prompt-registry/001-project-model-and-membership.md`'s collaborator-team capability (`project_teams` table, add/remove collaborator team, both invariants, owner-or-collaborator `listProjectsByTeam` matching) as part of its own scope, confirmed with the user during `/speckit-clarify` (spec.md Clarifications, 2026-07-30). `001`'s own backlog file is updated (Technical Notes) to record what was delivered on its behalf, matching the "document thoroughly on both sides" convention already used for the `008-authdb-consumer-handoff.md` precedent. `001` is **not** fully closed by this feature — only the participating-teams (owner + collaborator) concept is pulled forward; any other still-open, unrelated part of `001` remains open.
