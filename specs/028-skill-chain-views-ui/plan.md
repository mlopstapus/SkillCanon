# Implementation Plan: Skill Chain Views UI

**Branch**: `027-skill-chain-views-ui` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-skill-chain-views-ui/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Extend the already-shipped Skills (Prompt Registry) detail page (`src/app/(app)/prompts/[name]/*`, built by `023-prompt-registry-views-ui`) and its "New version" flow to handle the chain-kind `PromptVersion` shipped by `009-skill-chains` (archived) — a version that's an ordered step list instead of template text. Three additive pieces: (1) a "Steps" + "Run History" pair of sections on the detail page, shown instead of the template-kind Template/Preview/Applied-policies sections whenever the active version is a chain; (2) a Chain/Template kind toggle in the existing "New version" drawer, switching to a step-list builder; (3) two small, backward-compatible backend extensions this UI genuinely needs — paginating `listSkillChainRuns` (it currently returns every run unbounded) and surfacing which chain version a run executed (already stored as `skill_chain_runs.prompt_version_id`, but dropped by both existing read functions today). No new route, page shell, or navigation entry — chains stay fully composed into the existing `/prompts` pages per FR-016.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 16 (App Router), React 19

**Primary Dependencies**: Drizzle ORM (`postgres-js` driver), Tailwind v4, `src/shared/ui` (Badge, `cn()`), `src/bcs/prompt-registry` (`listSkillChainRuns`, `getSkillChainRun`, `publishVersion`, `listPrompts`, `listVersions`, `getPrompt` — all already exported; two of these get extended, not replaced)

**Storage**: PostgreSQL via the existing `prompt_registry` schema. No new tables and no migration — `skill_chain_runs.prompt_version_id` already exists (added by `009-skill-chains`); this feature only changes which columns the *read* functions select and join, not the schema.

**Testing**: Vitest — Testcontainers-backed tests for the two changed `application/`+`infrastructure/` functions (this repo's established pattern), `renderToStaticMarkup`-only tests for the new/changed React view components (no jsdom/click-simulation), per this repo's established convention.

**Target Platform**: Server-rendered Next.js App Router pages within the existing `(app)` route group, self-hosted via Docker Compose or the existing CI/CD pipeline.

**Project Type**: Web application — single unified Next.js app; no separate frontend/backend split.

**Performance Goals**: No new performance envelope beyond what pagination already solves — a chain's run history is per-skill, not org-wide, and the same `page`/`pageSize` shape as `audit-compliance`'s `listAuditEvents` (default page size 20, mirroring that BC's `DEFAULT_AUDIT_PAGE_SIZE`/`MAX_AUDIT_PAGE_SIZE` pattern at a smaller scale appropriate to a single skill's runs) keeps each query bounded regardless of how many runs accumulate.

**Constraints**: A `"use client"` component must never import a real (non-type) value from `@/bcs/prompt-registry`'s barrel directly (documented gotcha — drags server-only deps into the browser bundle); every read/write stays in `page.tsx` (server) or `actions.ts` (`"use server"`), matching this page's existing convention exactly. Every mutating action stays gated by the same authorization already enforced in the application layer — this feature adds no new authorization rule (chain and template versions share one `publishVersion`, sharing, and project-assignment path).

**Scale/Scope**: One extended data type (`PromptDetailData` gains chain-specific fields), one extended view component (`PromptDetailView`) and its thin wrapper (`PromptDetail`), one extended drawer (`NewVersionDrawer`) plus one new pure sub-component (the step-list builder), one small backend read extension (`listSkillChainRuns` pagination + version label, `getSkillChainRun` version label), two new read-only server actions (`listSkillChainRunsAction` for paging run history, `getSkillChainRunAction` for lazily fetching one run's step detail on expand — neither needs a full page navigation), one small existing-component polish fix (`VersionHistoryDrawer`'s per-version preview line, currently always blank for a chain version).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First (P1)**: Every changed application/infrastructure function (`list-skill-chain-runs.ts`, `get-skill-chain-run.ts`, `skill-chain-runs-repo.ts`) gets its existing Testcontainers-backed test file extended with pagination/version-label assertions before the implementation change lands, per `tasks.md`. Every new/changed React component gets a `renderToStaticMarkup` test extended or added alongside it.
- **II. Domain-Driven Bounded Contexts (D1)**: All UI changes compose `prompt-registry` exclusively through its existing public barrel (`@/bcs/prompt-registry`) — no new cross-BC surface. The two backend read extensions stay entirely inside `prompt-registry`'s own `application`/`infrastructure` layers.
- **III. Domain Invariants in Domain Layer (D2)**: No new business rule is introduced — pagination bounds (`DEFAULT_CHAIN_RUN_PAGE_SIZE`/`MAX_CHAIN_RUN_PAGE_SIZE`) live in `domain/skill-chain.ts` alongside the chain domain's existing validation, mirroring where `audit-compliance` keeps its own equivalent constants (`domain/audit-event.ts`), not inlined into the application function or a route handler.
- **IV. Multi-Tenant Isolation (M1-M3)**: No new table, so no new RLS surface. Both extended read functions keep their existing `organizationId` scoping and RLS-backed connection; the new join to `promptVersions` for the version label is scoped by the already-org-filtered `skill_chain_runs` row, so it introduces no cross-tenant read path.
- **V. Secure by Default (S1-S3)**: No new secret-handling surface, no new template rendering path — the Steps/Run History views only display already-`expand()`-resolved content (`systemMessage`/`userMessage`) exactly as `009-skill-chains` persisted it; this feature never re-renders or re-expands anything.
- **VI. Auditable & Compliant (C1-C2)**: No new mutation is introduced by this feature beyond what `publishVersion` (already audited, `009-skill-chains`) covers for a chain version exactly like a template version. The two changed functions are pure reads (already documented as such in `CONTRACT.md`) — no audit event is expected or added for them.
- **VII. Feature-Gated by Entitlement (G1)**: No new entitlement key is introduced. Consistent with every other Prompt Registry view feature (`023-prompt-registry-views-ui`), gating is satisfied by composition — this page already lives under `src/app/(app)/`, whose layout already calls `resolveAppShellAccess()` before any child route renders. Per spec.md's Assumptions, billing/entitlements are currently deferred indefinitely project-wide, and no sibling Prompt Registry view feature gates on a feature-specific key today — this feature does not introduce the first one.

**Result**: PASS. No violations requiring Complexity Tracking justification.

**Post-design re-check** (after Phase 1): `data-model.md`'s additions (`ChainRunSummary.version`, the `NewVersionValues.steps` extension, the new `ChainStepDraft` UI-local type) stay entirely inside existing files/types being extended, not new bounded-context surface. `listSkillChainRunsAction` is a plain read wrapper around the already-barrel-exported `listSkillChainRun`s, following the exact `"use server"` + `withTenantContext` shape every other action in `actions.ts` already uses. Still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/028-skill-chain-views-ui/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── skill-chain-views-ui.contract.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── bcs/prompt-registry/
│   ├── domain/skill-chain.ts                     # + DEFAULT_CHAIN_RUN_PAGE_SIZE, MAX_CHAIN_RUN_PAGE_SIZE, normalizeChainRunPagination(); ChainRunSummary gains `version: string`
│   ├── infrastructure/skill-chain-runs-repo.ts   # listByPromptForOrg: + limit/offset params, joins promptVersions for `version` label; + countByPromptForOrg; findByIdForOrg: + same join
│   ├── application/list-skill-chain-runs.ts      # Signature: (db, orgId, promptId, options?: {page?, pageSize?}) → { items, page, pageSize, total } (mirrors audit-compliance's listAuditEvents shape)
│   ├── application/get-skill-chain-run.ts        # `run.version` now populated from the joined promptVersions row
│   ├── CONTRACT.md                               # Update listSkillChainRuns/getSkillChainRun rows for the new pagination/version-label shape
│   └── *.test.ts                                 # Extended: list-skill-chain-runs.test.ts, get-skill-chain-run.test.ts, skill-chain-runs-repo already covered indirectly
│
├── app/(app)/prompts/
│   ├── actions.ts                                # publishVersionAction: + optional `steps?: ChainStep[]` passthrough to publishVersion; + new listSkillChainRunsAction(promptId, page) and getSkillChainRunAction(runId) read actions
│   └── [name]/
│       ├── page.tsx                              # Server: when active version kind === "chain", also call listSkillChainRuns (page 1) and pass steps + initial runs page into PromptDetailData; pass listPrompts(actor) accessible-skill names into the New Version drawer for the step builder's picker
│       ├── prompt-detail-view.tsx                # PromptDetailData gains `kind`, `steps`, `chainRuns` (initial page); renders "Steps"/"Run History" sub-tabs instead of Template/Preview/Applied-policies when kind === "chain"; a run row's step detail is fetched lazily on first expand
│       ├── prompt-detail.tsx                      # Wires the new step-builder's onSubmit (passes `steps` through to publishVersionAction), the Run History pager's onPageChange (calls listSkillChainRunsAction), and a run row's onExpand (calls getSkillChainRunAction once, caches result in local state)
│       ├── new-version-drawer.tsx                # + Template/Chain kind toggle; renders <ChainStepBuilder> in place of the template fields when Chain is selected
│       ├── chain-step-builder.tsx                 # New, pure component: add/remove/reorder step rows, skill picker (from the accessible-skill list passed in), optional version pin, depends-on chip toggles restricted to earlier steps
│       ├── version-history-drawer.tsx            # Small fix: shows "N steps" instead of a blank template preview when a version's kind is "chain"
│       └── *.test.tsx                            # Extended: prompt-detail-view.test.tsx (chain-kind rendering), new-version-drawer.test.tsx (kind toggle + builder), version-history-drawer.test.tsx; new: chain-step-builder.test.tsx
```

**Structure Decision**: Single unified Next.js app, extending the exact page/component tree `023-prompt-registry-views-ui` already established (`page.tsx` server → `*-view.tsx` pure view → thin client wrapper). No new route or page shell. The one new file is `chain-step-builder.tsx`, a pure presentational component following this same View pattern — it's a distinct enough unit (multi-row add/remove/reorder/dependency-toggle state) to warrant its own file rather than growing `new-version-drawer.tsx` past a readable size, mirroring why `assign-projects-drawer.tsx`/`share-drawer.tsx` are already their own files rather than inlined into `prompt-detail.tsx`. The pagination-triggering `listSkillChainRunsAction` is a plain read action (a new but minimal pattern for this route — every existing action here is a mutation) rather than encoding the run-history page number into the route's URL searchParams: the Steps/Run-History choice and every other tab on this exact page (Template/Preview/Applied-policies) is already local client state with no URL involvement, so a read action keeps this one new stateful control consistent with its immediate siblings rather than introducing URL-driven paging for only this one sub-tab (see research.md).

## Complexity Tracking

> No Constitution Check violations — this section is intentionally empty.
