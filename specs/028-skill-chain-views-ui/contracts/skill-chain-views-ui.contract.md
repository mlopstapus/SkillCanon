# Contract: Skill Chain Views UI

No external (customer-facing) HTTP API — server-rendered pages plus Next.js Server Actions, extending `023-prompt-registry-views-ui`'s existing contract rather than introducing a new one. Contracts here are (a) the access-control surface (unchanged), (b) the server-action surface additions, and (c) the `src/bcs/prompt-registry` `CONTRACT.md` changes this feature requires.

## Access control contract (unchanged)

- **Route**: `/prompts/[name]` — the same route `023-prompt-registry-views-ui` already built. No new route.
- **Requirement**: Same as today — any authenticated, entitled org member may view; `publishVersionAction` re-checks authorization server-side regardless of which kind (template or chain) is being published, since chain and template versions share one `publishVersion` code path.
- **Enforcement point**: Unchanged — `(app)/layout.tsx`'s `resolveAppShellAccess()`. The new `listSkillChainRunsAction` independently calls `authenticateSession()` before invoking `listSkillChainRuns`, matching every other action in `actions.ts`.

## Server action surface additions

`src/app/(app)/prompts/actions.ts`:

| Action | Wraps | Notes |
|---|---|---|
| `publishVersionAction(params)` | `publishVersion` | **Changed**, not new: `params` gains optional `steps?: ChainStep[]`; passed through unchanged when present. `setActive` handling (rollback-to-previous on opt-out) is reused verbatim — no branch on kind. |
| `listSkillChainRunsAction(promptId, page)` | `listSkillChainRuns` | **New.** Read (non-mutating) action — returns `{ ok: true; items, page, pageSize, total } \| { ok: false; error }`, called directly by the Run History pager (research.md: local state, not a URL search param). |
| `getSkillChainRunAction(runId)` | `getSkillChainRun` | **New.** Read (non-mutating) action — returns `{ ok: true; run; steps } \| { ok: false; error }`. `listSkillChainRunsAction`'s summaries carry no per-step detail (`ChainRunSummary` has none), so a run row's step-by-step content is fetched lazily, once, the first time that row is expanded — never prefetched for every row up front. |

## `src/bcs/prompt-registry/CONTRACT.md` changes

Updated rows for the "Exposed APIs" table:

- `listSkillChainRuns(db, orgId, promptId, options?: { page?, pageSize? })` — **changed return shape**: now `{ items: ChainRunSummary[]; page; pageSize; total }` instead of a bare array; each `ChainRunSummary` gains `version` (the chain version label the run executed). Still a pure, org-scoped read — no `expand()` call, no state transition.
- `getSkillChainRun(db, orgId, runId)` — same `{ run, steps } | null` shape; `run.version` is now populated instead of absent.

No changes to `startSkillChainRun`/`advanceSkillChainRun`/`abandonSkillChainRun` — this feature never calls them (spec.md FR-009, Assumptions).

No new "Events Published" rows — no new mutation is introduced.

## Redaction / rendering contract (inherited, not modified)

The Run History step-detail view renders `ChainRunStepRecord`'s `systemMessage`/`userMessage`/`reportedError` fields verbatim, exactly as `009-skill-chains` persisted them — this feature never re-renders, re-expands, or redacts anything. The Steps section renders `ChainStep` fields (`promptName`, `promptVersion`, `dependsOn`) verbatim from the active version's stored content.
