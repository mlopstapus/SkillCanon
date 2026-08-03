# Research: Skill Chain Views UI

No `NEEDS CLARIFICATION` markers remained in the Technical Context — this feature's entire technical surface was resolved by reading the existing, already-shipped code it extends (`009-skill-chains`'s backend, `023-prompt-registry-views-ui`'s page/component tree) rather than by exploring open technology choices. This file records the decisions made while confirming that surface and closing the two small backend gaps `spec.md` calls out.

## Decision: Run History pagination shape mirrors `audit-compliance`'s `listAuditEvents`

**Decision**: Extend `listSkillChainRuns(db, organizationId, promptId, options?: { page?: number; pageSize?: number })` to return `{ items: ChainRunSummary[]; page: number; pageSize: number; total: number }`, with `page`/`pageSize` normalization (`normalizeChainRunPagination`) and constants (`DEFAULT_CHAIN_RUN_PAGE_SIZE`, `MAX_CHAIN_RUN_PAGE_SIZE`) living in `domain/skill-chain.ts`.

**Rationale**: This is the only other paginated list in the codebase (`audit-compliance/domain/audit-event.ts`'s `normalizeAuditPagination`, `DEFAULT_AUDIT_PAGE_SIZE`/`MAX_AUDIT_PAGE_SIZE`, and `listAuditEvents`'s `{ items, page, pageSize, total, ... }` return shape). Reusing that exact shape means the UI's Prev/Next pager (`src/app/(app)/settings/audit-log/audit-log-view.tsx`) is a proven, already-built pattern to copy rather than a new one to invent.

**Alternatives considered**:
- A cursor/keyset-based API (`{ items, nextCursor }`) — better suited to true infinite-scroll, but nothing else in this codebase uses it, and the Clarifications decision (spec.md) explicitly chose to match the existing audit-log precedent, which is offset/page-based.
- Leaving `listSkillChainRuns` unbounded and only truncating in the UI — rejected because the query itself, not just the rendering, is unbounded today; truncating client-side still transfers and holds every row.

## Decision: Run History page changes go through a new read server action, not a URL search param

**Decision**: Add `listSkillChainRunsAction(promptId: string, page: number)` (a plain, non-mutating `"use server"` function in `src/app/(app)/prompts/actions.ts`) that the Run History view's client wrapper calls directly, holding the result in local component state. The route's URL is untouched by which run-history page is currently shown.

**Rationale**: Every other piece of tab/sub-tab state on this exact page (`activeTab` for Template/Preview/Applied-policies, and the new Steps/Run-History choice for a chain version) is plain client `useState`, with no URL involvement — that's this page's own established convention, distinct from a dedicated list page like `/settings/audit-log` where the URL *is* the page's entire state (search, filters, and page number together). Introducing URL-driven paging for only the Run History sub-tab, while its sibling tabs stay URL-free, would be a one-off inconsistency on the same page rather than following a codebase-wide precedent.

**Alternatives considered**:
- URL search params on `/prompts/[name]` (e.g. `?runsPage=2`), mirroring audit-log exactly — rejected for the reason above: audit-log's URL-as-state approach fits a page whose entire content *is* the paginated list; here pagination is nested inside one sub-tab of a page with several other, URL-free tabs.
- Fetching all pages eagerly in `page.tsx` and paginating client-side only — rejected as reintroducing the exact unbounded-query problem this feature exists to close.

## Decision: Surfacing which chain version a run executed

**Decision**: Join `skill_chain_runs` to `prompt_versions` on the already-stored `prompt_version_id` foreign key inside `skill-chain-runs-repo.ts`'s `listByPromptForOrg`/`findByIdForOrg`, projecting the version's `version` text label into each returned row; `list-skill-chain-runs.ts`/`get-skill-chain-run.ts` map it onto `ChainRunSummary.version`.

**Rationale**: `prompt_version_id` has been captured on every run row since `009-skill-chains` shipped it — the gap is purely that neither existing read function selects/returns it. A join is strictly additive (no schema change, no migration) and mirrors how `prompts-repo.ts` already joins across tables for other read-side label resolution elsewhere in this BC.

**Alternatives considered**: Returning the raw `promptVersionId` (a UUID) and resolving the display label in the UI layer via a second call to `getPromptVersion` per run — rejected as an unnecessary N+1 the join avoids entirely; every other resolved-label pattern in this BC (e.g. owner name resolution in `page.tsx`) already prefers a single batched read over a per-row follow-up call.

## Decision: A run's step detail is fetched lazily per row, not prefetched for the whole page

**Decision**: `listSkillChainRunsAction` returns only `ChainRunSummary` rows (no step detail — that type never carried it). A second action, `getSkillChainRunAction(runId)`, is called once when a specific run row is expanded in the UI, and its result is cached in the wrapper's local state so re-collapsing/re-expanding the same row doesn't refetch.

**Rationale**: `getSkillChainRun`'s own doc comment already frames it as "one run plus its full step history" — a genuinely separate, heavier read from the summary list. Fetching every row's full step detail (each including full system/user messages) for an entire page of runs the moment the page loads would multiply the query cost by the page size for content most of which a user will never expand.

**Alternatives considered**: Embedding step detail directly in `listSkillChainRuns`'s response — rejected; it would silently make every existing/future caller of that function pay for full message content it doesn't need, and breaks the clean separation `CONTRACT.md` already documents between the two functions.

## Decision: `NewVersionDrawer`'s "set active immediately" checkbox applies to both kinds

**Decision**: The existing `setActive` checkbox (currently only visually adjacent to the template fields in the source mockup) stays a single control shown regardless of which kind is selected, and `publishVersionAction`'s existing `setActive` handling (roll back to the previously-active version when the caller opts out) is reused verbatim for a chain-kind publish — no new branch.

**Rationale**: `publishVersionAction`'s current implementation (`src/app/(app)/prompts/actions.ts`) already computes `previouslyActive` and conditionally calls `rollbackPrompt` purely based on the boolean `params.setActive`, with no dependency on template-specific fields — passing `steps` through instead of `systemTemplate`/`userTemplate` requires no change to that logic at all. Confirmed by reading the function body, not assumed.

**Alternatives considered**: Building a chain-specific "set active" code path — rejected; there is nothing kind-specific about that logic to duplicate.

## Decision: `VersionHistoryDrawer`'s per-version preview line for a chain version

**Decision**: When a listed version's `kind` is `"chain"`, show `"{n} steps"` in place of the truncated `systemTemplate` preview (which is always `null`/"—" for a chain version today).

**Rationale**: `version-history-drawer.tsx` currently renders `{v.systemTemplate ?? "—"}` unconditionally — for a chain version this always shows a bare "—" with no indication of its actual size, which reads as broken rather than intentional. This is a two-line, low-risk fix bundled into the same "kind-specific detail" work the spec already calls for (User Story 1), not new scope needing its own FR.

**Alternatives considered**: Leaving the blank "—" as-is — rejected as a visibly broken-looking regression the moment chain versions exist, easily avoided.
