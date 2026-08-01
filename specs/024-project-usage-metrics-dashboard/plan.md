# Implementation Plan: Project Usage Metrics Dashboard

**Branch**: `024-project-usage-metrics-dashboard` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

## Summary

Adds a "Metrics" tab to the existing Project Detail page (`src/app/(app)/projects/[id]/`), backed by a genuinely new capability: recording real (non-test) prompt invocations. This is a cross-BC feature pulled forward from the not-yet-started `008-distribution` epic: `distribution.prompt_usage` is stood up for the first time (schema + a `recordPromptUsage`/`getPromptUsageSummaryForProject` pair of exposed functions), and `prompt-registry` composes that with its own `Project`/`ProjectMember`/`ProjectSkillAssignment` data to compute the tiles, gap panel, stacked-bar trend, and by-skill/by-member tables. Per spec Clarifications, no production code path calls `recordPromptUsage` yet (the live-preview test flow must never count as usage, and no genuine CLI/REST/MCP caller exists until `008-distribution` ships) — every project correctly shows a "no usage yet" empty state today; this feature is proven correct via direct fixture-seeded tests, not a live end-to-end call.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20)

**Primary Dependencies**: Drizzle ORM (postgres-js), Vitest (Testcontainers-backed for DB tests, `renderToStaticMarkup`-only for React components), `@/shared/db` helpers (`id`, `organizationId`, `timestamps`, `distributionSchema`), `@/bcs/prompt-registry` (existing `listProjectMembers`, `listProjectSkillAssignmentsForOrganization`, `listSkillsByOrganization`), `@/bcs/distribution` (new: `recordPromptUsage`, `getPromptUsageSummaryForProject`)

**Storage**: PostgreSQL — new table `distribution.prompt_usage` (first table ever created in the `distribution` schema; the schema object itself already exists in `shared/db/schemas.ts`, unused until now)

**Testing**: Vitest with integration tests against a real Testcontainers-backed test database for the repo/application layers (seed rows directly via `recordPromptUsage`, no live invocation path exists to exercise instead); `renderToStaticMarkup` component tests for the new Metrics tab UI, per this repo's established convention (`022`/`023` precedent)

**Target Platform**: Linux server (Next.js App Router page + service layer), self-hosted via Docker Compose or the existing CI/CD pipeline

**Project Type**: Web application — single unified Next.js app; UI change lives in `prompt-registry`'s already-owned `src/app/(app)/projects/*` folder (per its `OWNERSHIP.md`), backed by a new `distribution`-owned table/functions

**Performance Goals**: No new performance envelope — a single project's usage volume is expected to be near-zero for the foreseeable future, since no genuine invocation caller exists yet anywhere in the codebase; revisit if that changes once `008-distribution` ships a real transport

**Constraints**: `recordPromptUsage` MUST NOT be called from the prompt detail page's live-preview flow (spec FR-002a) — this feature deliberately leaves that call site unwired, matching the Clarifications outcome that test/preview invocations must never count as usage. Every query is scoped by `organizationId` at the application layer; `distribution.prompt_usage` ships with **no Postgres RLS** for now, matching `prompt_registry`'s own established precedent of deferring RLS to a dedicated future tenant-isolation feature (see Complexity Tracking).

**Scale/Scope**: One new table, one new bounded-context read/write pair (`distribution`), one new read composition (`prompt-registry`'s `getProjectMetrics`), one new tab on an existing page. No new routes, no new bounded context.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution (`.specify/memory/constitution.md`) predates the TypeScript rewrite and describes the legacy Python/FastAPI stack, but states its principles apply "regardless of implementation language." Evaluated against the current codebase's actual TypeScript conventions:

- **I. Test-First (P1)**: Repo tests substitute for the legacy no-type-checker rationale. Every new repo/application function ships with a Testcontainers-backed test written alongside it, seeding `prompt_usage` rows directly through `recordPromptUsage` (the only way to produce fixture data, since no other caller exists).
- **II. Domain-Driven Bounded Contexts (D1)**: `distribution.prompt_usage` and its read/write functions live entirely in `src/bcs/distribution/`, exposed only through its public barrel. `prompt-registry`'s `getProjectMetrics` calls `distribution`'s exposed `getPromptUsageSummaryForProject` — never imports `distribution`'s schema/repo modules directly. This is the **first real code** in the `distribution` BC (previously `.gitkeep` scaffolds only), so this feature also establishes the `domain/`/`infrastructure/`/`application/` split there for the first time.
- **III. Domain Invariants in Domain Layer (D2)**: Gap/coverage computation (which members are missing which required skills, skill-level coverage ratio) lives in `prompt-registry/application/get-project-metrics.ts`, not duplicated in the UI component — the component only renders what it's given.
- **IV. Multi-Tenant Isolation (M1-M3)**: Every `prompt_usage` query is explicitly scoped by `organizationId` (and, for project-scoped reads, `projectId`) at the application/repo layer — the sole current control, since RLS isn't enabled on this table yet (see Complexity Tracking). A negative cross-org test is included per Principle IV despite no RLS backstop, matching `prompt_registry`'s own precedent of application-layer-only isolation before its dedicated RLS feature landed.
- **V. Secure by Default (S1-S3)**: No secrets, no template rendering involved.
- **VI. Auditable & Compliant (C1-C2)**: **Not applicable to `recordPromptUsage`** — usage telemetry is explicitly distinct from the audit trail (`008-distribution/004-usage-telemetry.md`'s own Technical Notes, restated in `bcs/distribution/CONTRACT.md`); no `withAudit` wrapper, no audit event. The Metrics tab itself is a read-only view, nothing to audit.
- **VII. Feature-Gated by Entitlement (G1)**: Satisfied by composition, not a new gate — the Metrics tab is a new element within `src/app/(app)/`, whose `layout.tsx` already calls `resolveAppShellAccess()` (`coreFeaturesEnabled`, defaults `true` for both tiers) before any child route renders, exactly as `023-prompt-registry-views-ui`'s own Constitution Check concluded for its own new tabs. No new entitlement key needed.

**Result**: PASS. No violations requiring Complexity Tracking justification beyond the pull-forward and no-RLS notes below (informational, not blocking).

**Post-design re-check** (after Phase 1): `distribution`'s two new exposed functions (`recordPromptUsage`, `getPromptUsageSummaryForProject`) are documented in its `CONTRACT.md` and its `OWNERSHIP.md`'s `prompt_usage` row is updated to the actual shipped column set (data-model.md). `prompt-registry`'s `getProjectMetrics` is documented in its own `CONTRACT.md` and re-exported from its barrel. No schema/migration touches an RLS-protected table. Still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/024-project-usage-metrics-dashboard/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── project-usage-metrics-dashboard.contract.md
├── checklists/
│   └── requirements.md
└── tasks.md              # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/bcs/distribution/                              # first real code in this BC — was .gitkeep-only
├── domain/
│   └── prompt-usage.ts                            ← NEW: PromptUsageEvent, RecordPromptUsageParams, PromptUsageSummaryForProject types
├── infrastructure/
│   ├── schema.ts                                  ← NEW: `promptUsage` table (distributionSchema)
│   └── prompt-usage-repo.ts                       ← NEW: insert, countTotalForProject, listSinceForProject,
│                                                      listGroupedBySkillForProject, listGroupedByMemberForProject,
│                                                      listDailyCountsBySkillForProject
├── application/
│   ├── record-prompt-usage.ts                     ← NEW: recordPromptUsage(db, params)
│   ├── record-prompt-usage.test.ts                ← NEW
│   ├── get-prompt-usage-summary-for-project.ts    ← NEW: getPromptUsageSummaryForProject(db, orgId, projectId, opts)
│   └── get-prompt-usage-summary-for-project.test.ts ← NEW (incl. negative cross-org test)
├── index.ts                                        ← EXTEND (currently `export {};`)
└── CONTRACT.md                                     ← EXTEND: document both new exposed functions, correct the
                                                        `PromptExpanded` "event" framing to reflect the real direct-call
                                                        implementation
└── OWNERSHIP.md                                     ← EXTEND: update `distribution.prompt_usage` row to the real
                                                        column set actually shipped (data-model.md)

src/bcs/prompt-registry/
├── application/
│   ├── get-project-metrics.ts                     ← NEW: composes distribution's summary + this BC's own
│   │                                                  project members / skill assignments into ProjectMetrics
│   └── get-project-metrics.test.ts                ← NEW
├── index.ts                                        ← EXTEND: +getProjectMetrics, +ProjectMetrics type
└── CONTRACT.md                                      ← EXTEND: document getProjectMetrics

src/app/(app)/projects/[id]/
├── project-detail-view.tsx                        ← EXTEND: `ProjectDetailTab` gains `"metrics"`; render the new
│                                                      tab content (4 tiles, gap panel/all-clear, stacked-bar trend,
│                                                      by-skill table, by-member table)
├── project-detail-view.test.tsx                   ← EXTEND: cover the new tab's states (populated, empty, gap,
│                                                      all-clear) — rendered directly per this repo's
│                                                      always-render-all-tabs testing convention, not simulated clicks
├── project-metrics-trend-chart.tsx                ← NEW: pure presentational stacked-bar-per-skill component
├── project-metrics-trend-chart.test.tsx           ← NEW
├── project-detail.tsx                              ← UNCHANGED (no new mutation/action — this tab is read-only)
└── page.tsx                                        ← EXTEND: fetch `getProjectMetrics` alongside existing
                                                        Promise.all data, map ids → display names using data
                                                        already fetched (allUsers, skillRows) exactly like every
                                                        other tab already does

drizzle/migrations/
└── 00XX_distribution_prompt_usage.sql              ← NEW (exact number assigned during /speckit-tasks — check
                                                        for any migration merged to main after this branch's base)
```

**Structure Decision**: Single unified Next.js app, no frontend/backend split. New capture/read logic lives in `distribution` (the BC that owns `prompt_usage` per its `OWNERSHIP.md`, and the BC every future genuine caller — CLI/REST/MCP — will belong to). The domain-specific composition (required-skill coverage, per-member gaps) lives in `prompt-registry`, which already owns `Project`/`ProjectMember`/`ProjectSkillAssignment` and the `src/app/(app)/projects/*` UI folder per its own `OWNERSHIP.md` — matching the established pattern of composing a cross-BC read at the application layer of whichever BC owns the *presentation* concern (mirrors `020-audit-log-ui`'s resource-name resolvers composing four other BCs' public getters). The trend chart is split into its own pure presentational component (`project-metrics-trend-chart.tsx`) rather than inlined in `project-detail-view.tsx`, since it has real internal layout logic (stacking, per-skill color/ordering) worth isolating and testing independently — matching this repo's existing pattern of extracting a non-trivial sub-view (e.g. `PromptGroup` in the same file today) rather than one large component.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. Two deliberate, informational items flagged for visibility, matching this repo's established precedent for documenting a pull-forward and a known, accepted gap:

1. **Pull-forward of `008-distribution/004-usage-telemetry.md`**: this feature creates `distribution.prompt_usage` for the first time, with a column set (`organization_id`, `prompt_id`, `prompt_version_id`, `project_id` nullable, `user_id` nullable, `created_at`) that diverges from that item's originally-planned columns (`prompt_name`/`prompt_version` strings, `status_code`, `latency_ms`) — already documented on both sides (`backlog/006-prompt-registry/008-project-usage-metrics-dashboard.md` and `backlog/008-distribution/004-usage-telemetry.md`, updated 2026-08-01). `004` is **not** closed by this feature — REST-layer `status_code`/`latency_ms`, workflow-step recording, and MCP parity remain open, owned there.
2. **No Postgres RLS on `distribution.prompt_usage`**: matches `prompt_registry`'s own established precedent (shipped without RLS, deferred to a dedicated tenant-isolation feature) rather than an oversight. No such feature is yet tracked for the `distribution` schema anywhere in the backlog (unlike `prompt_registry`, which has `backlog/006-prompt-registry/005-prompt-registry-tenant-isolation-tests.md`) — flagged during this feature's implementation as a new backlog item under `008-distribution` so it isn't lost.
