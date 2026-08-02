# Implementation Plan: Skill Chains

**Branch**: `026-skill-chains` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

## Summary

Adds a second `PromptVersion` kind — a **chain version** (an ordered list of steps, each invoking another skill) — alongside the existing template version, via an explicit `kind` discriminant column plus a nullable `steps` jsonb column on `prompt_registry.prompt_versions`. Adds a client-driven, step-by-step run capability (`startSkillChainRun`, `advanceSkillChainRun`, `abandonSkillChainRun`, `listSkillChainRuns`, `getSkillChainRun`) backed by two new RLS-protected tables, `prompt_registry.skill_chain_runs` and `prompt_registry.skill_chain_run_steps`. Each step resolves through this same BC's `expand()`, called internally — Prompt Registry never executes a step against a model and never sees real output, only what the caller self-reports. Per [PDR-017](../../docs/pdr/017-fold-workflow-orchestration-into-prompt-registry.md), this fully retires `src/bcs/workflow-orchestration/` and the `workflow.*` Postgres schema (confirmed via research: zero code consumers outside that folder, so deletion is safe). Chain versions inherit ownership, versioning, sharing (`subscribeSkill`/`forkSkill`), and project assignment for free — no new code needed for any of the three, since they already operate generically on `Prompt`/`PromptVersion`.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20)

**Primary Dependencies**: Drizzle ORM (postgres-js), Vitest (Testcontainers-backed for DB tests), `@/shared/db` helpers (`id`, `organizationId`, `timestamps`, `promptRegistrySchema`, `withTenantContext`, `withAudit`, `isUniqueViolation`), `@/bcs/prompt-registry`'s own existing `expand()`, `fetchExpandableVersion`-style version resolution, `listAccessibleByOwnerAndSubscriptions`, `authorize-owner-action.ts` pattern, `@/bcs/audit-compliance` (`record`, `DEFAULT_WEB_AUDIT_CONTEXT`), `@/bcs/identity-access` (`getUser`, `UserSummary`)

**Storage**: PostgreSQL — extends `prompt_registry.prompt_versions` (new `kind`/`steps` columns), adds `prompt_registry.skill_chain_runs` and `prompt_registry.skill_chain_run_steps` (both new, both RLS-protected from creation — no follow-up tenant-isolation feature needed). Drops `workflow.workflows` and the `workflow` Postgres schema entirely.

**Testing**: Vitest with Testcontainers-backed integration tests for every new repo/application function (`startTestDb()` + `withTenantContext(testDb.appDb, orgId, tx => ...)`, per this repo's established pattern), including negative cross-org tests for the two new tables (constitution Principle IV) and a race/conflict test for `advanceSkillChainRun` (two concurrent calls against the same run).

**Target Platform**: Linux server (Next.js App Router app, no new routes — this feature ships as bounded-context application functions only, matching the established precedent that Identity & Access / Prompt Registry features build the BC layer and leave HTTP/MCP wiring to `008-distribution`), self-hosted via Docker Compose or the existing CI/CD pipeline.

**Project Type**: Single unified Next.js app (no frontend/backend split). This feature is BC-layer only — `src/bcs/prompt-registry/{domain,application,infrastructure}` plus a migration. `backlog/006-prompt-registry/010-skill-chain-views-ui.md` (the read-only run-history UI) is a separate, later feature consuming `listSkillChainRuns`/`getSkillChainRun`.

**Performance Goals**: No new performance envelope. A chain run is one row-locked read-modify-write per `advanceSkillChainRun` call — no different in shape from any other single-row mutation elsewhere in this codebase; no stated latency/throughput target, matching every other feature in this repo's specs.

**Constraints**: A step's caller-supplied `output` is capped at 64 KB (spec FR-014) and stored as opaque text — never parsed. `advanceSkillChainRun` and `abandonSkillChainRun` MUST reject a call against a run not currently `in_progress` (spec FR-007b) and MUST serialize concurrent calls against the same run so a racing/duplicate report is rejected as a conflict, never silently applied (spec FR-007a) — implemented via `SELECT ... FOR UPDATE` row locking inside the mutating transaction, not `updated_at`-based optimistic concurrency (the shared `timestamps()` helper explicitly does not provide that, per its own doc comment). Authorization for starting/advancing/abandoning a run reuses the same accessible-skill set `listPrompts` already computes (owner, own team, subscribed, project-member-subscribed) — no new authorization concept (spec Clarifications) — and a caller without access is rejected with the same `PromptNotFoundError` a nonexistent skill would produce, never a distinguishing "found but not authorized" error, matching this codebase's established cross-org/no-access-looks-like-not-found convention.

**Scale/Scope**: One extended table (`prompt_versions`: +2 columns), two new tables, five new exposed application functions (`startSkillChainRun`, `advanceSkillChainRun`, `abandonSkillChainRun`, `listSkillChainRuns`, `getSkillChainRun` — one more than CONTRACT.md's four already-documented signatures; see Complexity Tracking), one deleted bounded context (`workflow-orchestration`, zero external consumers confirmed by repo-wide grep), two migrations.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First (P1)**: Every new repo/application function ships with a Testcontainers-backed test written alongside it. The concurrency guarantee (FR-007a) gets a dedicated test issuing two overlapping `advanceSkillChainRun` calls against the same run and asserting exactly one succeeds.
- **II. Domain-Driven Bounded Contexts (D1)**: All new code lives in `src/bcs/prompt-registry/`, exposed only through its public barrel. Chain-run functions call `expand()` and version-lookup helpers **within the same BC** (same-file/same-module imports, not a cross-BC contract call) — matching spec acceptance criterion "call `expand()`'s own internals directly (same-BC, not cross-BC)". No new bounded context is introduced; `workflow-orchestration` is deleted, not left running alongside.
- **III. Domain Invariants in Domain Layer (D2)**: Chain-step dependency validation (no self-reference, no forward/same-position reference, no duplicate step ids) lives in `domain/skill-chain.ts` as a pure function, called once by `startSkillChainRun` before any row is written — not duplicated at any future HTTP/MCP entry point.
- **IV. Multi-Tenant Isolation (M1-M3)**: Both new tables carry RLS from their very first migration (no retrofit gap, unlike `workflow.workflows`'s pre-existing missing-RLS gap that this feature deletes outright). `skill_chain_runs` has its own `organization_id`; `skill_chain_run_steps` resolves tenancy via an `EXISTS` join through `skill_chain_runs`, mirroring `prompt_versions`'s join through `prompts`. A negative cross-org test is included for both tables.
- **V. Secure by Default (S1-S3)**: No secrets. Chain steps still render through the same sandboxed Nunjucks environment `expand()` already uses — no new template surface. A step's opaque `output` is never logged or interpreted, only stored and later returned verbatim.
- **VI. Auditable & Compliant (C1-C2)**: Run completion, failure, and explicit abandonment each write an audit event transactionally (`skill_chain_run.completed` / `.failed` / `.abandoned`) via the established `withAudit` + `record()` pattern. Run creation and each intermediate step resolution are **not** separately audited — matching CONTRACT.md's already-documented Events Published table (only terminal outcomes are events) and `expand()`'s own precedent of being a pure, unaudited read.
- **VII. Feature-Gated by Entitlement (G1)**: No new entitlement key — chain versions are core Prompt Registry functionality, gated the same as every other skill (whatever gate already applies to `publishVersion`/`expand`, unchanged by this feature).

**Result**: PASS. No violations requiring justification beyond the informational items below.

**Post-design re-check** (after Phase 1): `prompt-registry`'s `CONTRACT.md` needs updating in two ways this feature's own design surfaces beyond what it already documents — `startSkillChainRun`'s return shape must accommodate the zero-step case (`{ runId, done: true }`, not always `{ runId, step }`), and a fifth exposed function (`abandonSkillChainRun`) is needed since ending a run early isn't naturally a variant of `advanceSkillChainRun`'s two-outcome (`success`/`error`) step report. Both are captured in Complexity Tracking below and applied to `CONTRACT.md`/`index.ts` as part of this feature's own implementation (not deferred), consistent with this repo's established convention of keeping `CONTRACT.md`'s Exposed APIs table and the real barrel in sync in the same change. Still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/026-skill-chains/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── skill-chains.contract.md
├── checklists/
│   └── requirements.md
└── tasks.md              # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/bcs/prompt-registry/
├── domain/
│   ├── skill-chain.ts                          ← NEW: ChainStep, ChainStepReport, ChainStepResolution,
│   │                                                RunStatus, validateChainSteps() (dependency-order +
│   │                                                duplicate-id validation), chain-run error classes
│   │                                                (InvalidChainDependencyError, RunNotFoundError,
│   │                                                RunAlreadyFinishedError, RunStepConflictError,
│   │                                                NotAChainVersionError)
│   └── prompt.ts                                ← EXTEND: PublishVersionParams gains `steps?`,
│                                                    PromptVersionSummary gains `kind`/`steps`,
│                                                    determinePromptVersionKind() + InvalidVersionShapeError
├── infrastructure/
│   ├── schema.ts                                ← EXTEND: promptVersions gains `kind` (enum, not null,
│   │                                                default 'template') + `steps` (jsonb, nullable);
│   │                                                NEW tables `skillChainRuns`, `skillChainRunSteps`
│   ├── skill-chain-runs-repo.ts                 ← NEW: insert, findByIdForUpdate (SELECT...FOR UPDATE),
│   │                                                updateStatus, listByPromptForOrg, findByIdForOrg
│   └── skill-chain-run-steps-repo.ts            ← NEW: insert, listByRunId, findPendingStep,
│                                                    recordReport
├── application/
│   ├── publish-version.ts                       ← EXTEND: validate exactly-one-shape via
│   │                                                determinePromptVersionKind(), write kind/steps
│   ├── expand.ts                                ← EXTEND: reject a resolved chain-kind version with
│   │                                                ExpansionSourceNotFoundError (same as any other
│   │                                                unresolvable version); export fetchExpandableVersion
│   │                                                (currently private) for reuse by start-skill-chain-run.ts
│   ├── authorize-chain-run-action.ts             ← NEW: assertSkillAccessible(db, actor, prompt) — reuses
│   │                                                listAccessibleByOwnerAndSubscriptions; throws the same
│   │                                                PromptNotFoundError a nonexistent skill would (no
│   │                                                distinguishing denial error)
│   ├── start-skill-chain-run.ts                  ← NEW: startSkillChainRun(db, actor, promptName, version?)
│   ├── advance-skill-chain-run.ts                ← NEW: advanceSkillChainRun(db, actor, runId, report)
│   ├── abandon-skill-chain-run.ts                ← NEW: abandonSkillChainRun(db, actor, runId, auditContext?)
│   ├── list-skill-chain-runs.ts                  ← NEW: listSkillChainRuns(db, orgId, promptId)
│   ├── get-skill-chain-run.ts                    ← NEW: getSkillChainRun(db, orgId, runId)
│   └── skill-chain-test-helpers.ts               ← NEW: shared fixture (org + chain-owning user/team +
│                                                    two or three dependent template skills to chain together)
├── index.ts                                       ← EXTEND: +5 new functions, +ChainStep/ChainStepReport/
│                                                    ChainStepResolution/RunStatus types, +new error classes
└── CONTRACT.md                                     ← EXTEND: correct startSkillChainRun's documented return
                                                        shape for the zero-step case; add abandonSkillChainRun
                                                        as a 5th Exposed API row; add SkillChainRunAbandoned to
                                                        Events Published (see Complexity Tracking)

src/bcs/workflow-orchestration/                     ← DELETED entirely (domain/, application/, infrastructure/,
                                                        index.ts, CONTRACT.md, OWNERSHIP.md) — zero consumers
                                                        outside this folder, confirmed by repo-wide grep

src/shared/db/schemas.ts                            ← EXTEND: remove `workflow`/`workflowSchema` export
                                                        (SCHEMAS.workflow, workflowSchema)

drizzle/migrations/
├── 00XX_prompt_registry_skill_chains.sql           ← NEW: prompt_versions kind/steps columns,
│                                                        skill_chain_runs + skill_chain_run_steps tables
│                                                        + RLS (exact number assigned during /speckit-tasks —
│                                                        confirmed next available is 0023 as of this plan)
└── 00XX_drop_workflow_schema.sql                    ← NEW: drop workflow.workflows + workflow schema
                                                        (generated by `pnpm db:generate` once the BC folder
                                                        and schemas.ts export are removed — hand-trim per
                                                        the missing-snapshot-files gotcha, CLAUDE.md)

backlog/008-distribution/004-usage-telemetry.md      ← EXTEND: correct the stale "WorkflowRunCompleted/
                                                        WorkflowRunFailed" line to SkillChainRunCompleted/
                                                        Failed/Abandoned; note this feature writes the audit
                                                        side only, not distribution.prompt_usage (see
                                                        Complexity Tracking)
```

**Structure Decision**: Everything lives inside `src/bcs/prompt-registry/`, the BC that already owns `Prompt`/`PromptVersion` — matching PDR-017's entire premise that a chain is a skill, not a separate bounded context. No new top-level BC folder is created; `workflow-orchestration`'s folder is deleted outright rather than emptied/superseded-in-place, since research confirmed zero live code depends on it. Run-state persistence (`skill_chain_runs`/`skill_chain_run_steps`) gets its own repo files (mirroring the one-repo-file-per-table convention already used for `projects`/`subscriptions`/etc.) rather than folding into `prompts-repo.ts`/`prompt-versions-repo.ts`, since the query shapes (row-locked read-modify-write, step-history reads) are distinct enough from the existing CRUD-style repos to warrant separation.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. Four deliberate, informational items flagged for visibility, matching this repo's established precedent for documenting a pull-forward, a scope refinement, or a known, accepted gap:

1. **`abandonSkillChainRun` is a 5th exposed function beyond CONTRACT.md's already-documented four.** CONTRACT.md (written during the `as-architect` design pass that produced PDR-017) lists only `startSkillChainRun`/`advanceSkillChainRun`/`listSkillChainRuns`/`getSkillChainRun`. Ending a run early (spec FR-009) doesn't fit naturally as a variant of `advanceSkillChainRun`'s `{ status: "success" | "error" }` report shape — a caller abandoning a run isn't reporting an outcome for the pending step, it's choosing not to continue at all. A dedicated function is more honest about that distinction than overloading `report` with a third pseudo-status. `CONTRACT.md` is updated as part of this feature's own implementation, not left to drift.
2. **`startSkillChainRun`'s return shape is a union, not always `{ runId, step }`.** A zero-step chain (spec FR-010) completes with nothing to resolve — CONTRACT.md's current one-line description doesn't call this out explicitly. Implemented as `{ runId, step } | { runId, done: true }`, matching `advanceSkillChainRun`'s already-documented "next step or `{ done: true }`" shape for symmetry. `CONTRACT.md` updated accordingly.
3. **`SkillChainRunCompleted`/`SkillChainRunFailed`/`SkillChainRunAbandoned` are audit-log actions (`record()` calls), not a real event bus** — confirmed by research that no pub/sub infrastructure exists anywhere in this codebase; "event" in every `CONTRACT.md` in this repo is documentation shorthand for "this function calls `record()` with this action string in the same transaction as its mutation" (see `research.md`). This feature adds a third, finer-grained action (`.abandoned`) alongside the two CONTRACT.md already names, for a more useful audit trail than conflating abandonment with failure — `CONTRACT.md`'s Events Published table is updated to list all three.
4. **The "Distribution (usage telemetry)" consumer named in CONTRACT.md's Events Published table is not wired by this feature.** Research confirmed `distribution.recordPromptUsage` is not called from any production code path anywhere in this codebase yet — not even `expand()` itself, per `024-project-usage-metrics-dashboard`'s own explicit FR-002a decision to leave that wiring unbuilt. Wiring chain-run completion into usage telemetry before `expand()`'s own ordinary-skill invocations are wired would be inconsistent scope creep — this feature only satisfies the "Audit" consumer (an `audit_events` row per terminal outcome). `backlog/008-distribution/004-usage-telemetry.md` is updated with a note tracking this as still-open work for that epic, per this repo's established forward-dependency-tracking convention.
5. **`ChainStepReport` gains a required `stepIndex` field beyond CONTRACT.md's originally documented `{status, output?, error?}` shape.** Found while writing the FR-007a concurrency test: without the caller naming which step its report is for, `advanceSkillChainRun` cannot actually distinguish a stale network-retry duplicate from a legitimate new report for whatever step is now current — both are structurally identical without it, and row locking alone only serializes access, not intent. Every resolution the caller previously received already carries `stepIndex`, so this asks nothing new of a well-behaved caller. `CONTRACT.md`'s data contract is updated accordingly.
6. **`skill_chain_runs` gained a `prompt_version_id` column not in the original `data-model.md` draft.** Found while implementing `advanceSkillChainRun`: without pinning which chain version a run is walking, there was no way to recover the full step list on a later advance call. Added before this feature's migration was applied anywhere real (Testcontainers-only at the time), so no backfill was needed.
7. **A system-side step-resolution failure (FR-011) does not persist a "failed" run status — the whole call rolls back instead**, a correction from this plan's original design (which tried to persist a failure marker in the same call that also throws). `db` is always the caller's own already-open outer transaction in this codebase's convention (`withTenantContext`), so nothing thrown from inside it can leave a partial write behind — true for every application function here, not unique to this one. The thrown `ChainStepResolutionFailedError` itself (structurally distinct from any normal return value) already satisfies "immediate and distinguishable" without a persisted marker; see research.md for the full reasoning, including why leaving an `advanceSkillChainRun` failure retryable in `in_progress` is arguably the better semantic anyway.
