# Data Model: Skill Chain Views UI

This feature extends existing types (from `009-skill-chains` and `023-prompt-registry-views-ui`) rather than introducing a new bounded context or table. Entities already fully defined by prior features are referenced, not redefined; only the actual additions/changes are spelled out.

## Existing entities this feature reads, unchanged

- **`PromptVersionSummary`** (`src/bcs/prompt-registry/domain/prompt.ts`) — `kind: "template" | "chain"`, `steps: ChainStep[] | null`. Already carries everything the Steps section needs; no change.
- **`ChainStep`** (`src/bcs/prompt-registry/domain/skill-chain.ts`) — `{ id, promptName, promptVersion?, dependsOn: string[] }`. Already exactly the shape the step builder both submits and the Steps section renders; no change.
- **`ChainRunStepRecord`** (`src/bcs/prompt-registry/domain/skill-chain.ts`) — per-step resolved content and self-reported outcome. Already exactly what the Run History step-detail expansion needs; no change.

## Changed entity

### `ChainRunSummary` (`src/bcs/prompt-registry/domain/skill-chain.ts`)

Adds one field:

| Field | Type | Notes |
|---|---|---|
| `version` | `string` | **New.** The chain version label (e.g. `"v2"`) this run executed, resolved via a join to `prompt_versions` on the already-stored `promptVersionId` (Story 2, Acceptance Scenario 5; research.md). |

All other fields (`id`, `promptId`, `userId`, `status`, `currentStepIndex`, `startedAt`, `completedAt`) are unchanged.

## Changed function signatures

### `listSkillChainRuns` (`src/bcs/prompt-registry/application/list-skill-chain-runs.ts`)

```ts
function listSkillChainRuns(
  db: Db,
  organizationId: string,
  promptId: string,
  options?: { page?: number; pageSize?: number },
): Promise<{ items: ChainRunSummary[]; page: number; pageSize: number; total: number }>
```

Previously returned a bare `ChainRunSummary[]` with no pagination. `page`/`pageSize` normalize the same way `audit-compliance`'s `normalizeAuditPagination` does (clamped to `[1, MAX_CHAIN_RUN_PAGE_SIZE]`, default `DEFAULT_CHAIN_RUN_PAGE_SIZE`). This is a breaking return-shape change to an already-shipped function — its one existing caller (this feature) is updated in the same change; grep confirms no other caller exists yet.

### `getSkillChainRun` (`src/bcs/prompt-registry/application/get-skill-chain-run.ts`)

Return shape unchanged (`{ run: ChainRunSummary; steps: ChainRunStepRecord[] } | null`) except that `run.version` is now populated instead of absent.

## New pagination constants (`domain/skill-chain.ts`)

| Name | Value | Notes |
|---|---|---|
| `DEFAULT_CHAIN_RUN_PAGE_SIZE` | `20` | Smaller than `audit-compliance`'s `DEFAULT_AUDIT_PAGE_SIZE` (50) — this list is scoped to one skill's runs, not an org-wide event stream. |
| `MAX_CHAIN_RUN_PAGE_SIZE` | `100` | Mirrors the same clamp-ceiling pattern as `MAX_AUDIT_PAGE_SIZE` (200), scaled down proportionally. |

`normalizeChainRunPagination(options?: { page?: number; pageSize?: number }): { page, pageSize, limit, offset }` — same shape and clamping behavior as `normalizeAuditPagination`.

## New UI-local types (`src/app/(app)/prompts/[name]/prompt-detail-view.tsx`)

`PromptDetailData` gains:

| Field | Type | Notes |
|---|---|---|
| `kind` | `"template" \| "chain"` | Of the currently-active version. Drives which section set (Template/Preview/Applied-policies vs. Steps/Run History) renders. |
| `steps` | `Array<{ id: string; promptName: string; promptVersionLabel: string \| null; dependsOn: string[] }> \| null` | Non-null only when `kind === "chain"`. Display-ready form of `ChainStep[]` — `promptVersionLabel: null` means "always latest" (Steps section, FR-002). |
| `chainRuns` | `{ items: ChainRunSummary[]; page: number; pageSize: number; total: number } \| null` | Initial (page 1) run history, non-null only when `kind === "chain"`. Subsequent pages come from `listSkillChainRunsAction`, held in the wrapper's own local state, not re-fetched into this prop. `items` carries **only** `ChainRunSummary` fields — no per-step detail (research.md: embedding it here would make every page load pay for full step content most runs never have expanded). |

Per-run step detail (`ChainRunStepRecord[]`) is **not** part of `chainRuns` and is never merged into its `items`. It's held in a separate wrapper-local cache, `Record<runId, ChainRunStepRecord[]>`, populated the first time a given run row is expanded via `getSkillChainRunAction` (contracts/) and reused on subsequent re-expansions of the same row without refetching.

`NewVersionValues` (currently template-only) gains:

| Field | Type | Notes |
|---|---|---|
| `kind` | `"template" \| "chain"` | Which the New Version drawer's toggle is set to at submit time. |
| `steps` | `ChainStep[] \| undefined` | Present only when `kind === "chain"`; passed straight through to `publishVersionAction` → `publishVersion`, unchanged shape. |

## New UI-local type (`chain-step-builder.tsx`)

`ChainStepDraft` — the step builder's in-progress row shape before publish: `{ id: string; promptName: string; promptVersion: string; dependsOn: string[] }`. `id` is assigned by the builder itself in creation order (spec.md Assumptions) and is never user-edited.
