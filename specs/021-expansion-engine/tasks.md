# Tasks: Skill Expansion Engine

**Feature**: 021-expansion-engine
**Branch**: `021-expansion-engine`
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md) | **Data Model**: [data-model.md](./data-model.md)

---

## Phase 1: Setup

- [X] T001 Verify project environment (Node.js, pnpm, TypeScript, Vitest, Drizzle all configured — existing project)
- [X] T002 Add `nunjucks` + `@types/nunjucks` to `package.json`, run `pnpm install` (new dependency — confirmed not previously installed, per `research.md`)

---

## Phase 2: Foundational

- [X] T003 Create `src/bcs/prompt-registry/domain/expansion.ts` — `ExpandParams`/`ExpansionResult` types, `MAX_INCLUDE_DEPTH = 3` constant, error classes (`ExpansionSourceNotFoundError` — used for both nonexistent and deprecated skills, matching legacy's single rejection path)
- [X] T004 Create `src/bcs/prompt-registry/infrastructure/template-renderer.ts` — Nunjucks environment setup (`throwOnUndefined: true`, `autoescape: false`), and the `include_prompt` global-registration helper (takes a prefetched name→version cache and a depth counter, returns the recursive render function described in `data-model.md`'s algorithm) — **no other file constructs a Nunjucks environment directly**
- [X] T005 Create `src/bcs/prompt-registry/application/expansion-test-helpers.ts` — shared fixtures: skills with/without system templates, skills with `include_prompt(...)` references (including a cyclic pair and a chain one level past the depth limit), a user with one policy of each enforcement type (prepend/append/inject), a user with objectives

---

## Phase 3: User Story 1 — Expand a skill into rendered message content (P1)

**Goal**: Render a skill's template against input, with no governance or inclusion involved yet.

**Independent Test**: Publish a simple skill, expand it, confirm input substitutes correctly; confirm deprecated/nonexistent skills are rejected; confirm undefined-variable and code-execution attempts fail safely.

- [X] T006 [US1] Create `src/bcs/prompt-registry/application/expand.ts` — `expand(db, { organizationId, promptName, input, userId?, projectId?, version? })`: fetches the requested (or active) version via existing `prompts-repo`/`prompt-versions-repo` queries, rejects a nonexistent or deprecated skill with `ExpansionSourceNotFoundError`, renders system/user templates via `template-renderer.ts` with no governance and no inclusion resolution yet (`appliedPolicies`/`objectives` hardcoded to `[]` at this stage — filled in by T008/T010), returns `ExpansionResult`
- [X] T007 [P] [US1] Create `src/bcs/prompt-registry/application/expand.test.ts` — tests: renders both messages with correct substitution; skill with no system template returns `systemMessage: null`; nonexistent skill rejected; deprecated skill rejected even when a specific still-existing version is explicitly requested; undefined-variable template throws; a template attempting code execution never executes it; **expanding with input that doesn't match the skill's declared `input_schema` still succeeds unvalidated (FR-012)**

---

## Phase 4: User Story 2 — Caller's governance policies are automatically applied (P1)

**Goal**: When an acting user is given, their effective policies/objectives are woven in automatically; when not, expansion is fully ungoverned.

**Independent Test**: Give a user one policy of each kind, expand as that user, confirm all three effects and the reported applied-policy list; confirm a no-user expansion is fully ungoverned regardless of the skill's owner.

- [X] T008 [US2] Extend `expand.ts`: when `userId` is given, call `resolveAllPolicies(db, actor, userId)` (no `projectId` — PDR-016, Policy has no project scope at all) and `resolveAllObjectives(db, actor, userId, projectId)` (forwarding `projectId` here **only** — FR-015), apply prepend/append/inject exactly per `_apply_policies`' legacy semantics (prepend before system content, append after user content, inject content made available as `templateVars.policies` for the template to reference), populate `appliedPolicies` and `objectives` on the result; when `userId` is omitted, skip both calls entirely and leave both fields empty regardless of whether `projectId` was given (FR-013)
- [X] T009 [P] [US2] Extend `expand.test.ts` (or add a sibling file) — tests: prepend policy content appears before system template content; append policy content appears after user template content; inject policy content only appears if the template references `{{ policies }}`; applied-policy list matches exactly; zero-policy user produces output identical to an ungoverned expansion; a skill owned by a different team than the invoking user still resolves policies from **the invoking user's own team chain**; no acting user given → fully ungoverned (empty `appliedPolicies` and `objectives`) regardless of the skill's owner type; **a caller-supplied `projectId` alongside a `userId` includes that project's objectives in the result, but has zero effect on which policies are applied (FR-015)**

---

## Phase 5: User Story 3 — Nested skill inclusion (P2)

**Goal**: A skill's template can pull another skill's content in by name, recursively, bounded at depth 3, degrading gracefully rather than erroring.

**Independent Test**: Skill A's template references skill B; expanding A includes B's rendered content; a chain one level past the depth limit renders a visible placeholder instead of failing; a nonexistent reference does the same; a cycle resolves in bounded time.

- [X] T010 [US3] Extend `expand.ts`: regex-prescan system/user template text for `include_prompt(['"]([a-z0-9-]+)['"]\)` references, breadth-first prefetch referenced skills' current active versions up to depth 3 into a name→version cache (matching legacy's prefetch loop), register `include_prompt` as a template global via `template-renderer.ts`'s helper that recursively renders a referenced skill's own system+user content (depth + 1) or returns the depth-exceeded/not-found placeholder string exactly as legacy does
- [X] T011 [P] [US3] Extend tests — a skill including another resolves correctly; a chain nested exactly to the depth limit all resolves; one level past the limit renders the placeholder string and the rest of expansion still completes; a reference to a nonexistent skill renders its own placeholder and expansion still completes; a cyclic pair (A includes B, B includes A) completes in bounded time rather than looping

---

## Phase 6: Characterization Testing

**Goal**: Prove this is a faithful port — same fixtures through both implementations produce identical output (spec SC-007).

- [X] T012 Write a small, standalone Python harness (not the full legacy server) at `legacy/backend/scratch/expand_characterization_harness.py` that runs the legacy `expand_prompt` directly against a fixed set of fixture inputs (mirroring `expansion-test-helpers.ts`'s fixtures) and records the output — run via `uv run` per `CLAUDE.md`'s existing legacy-test convention
- [X] T013 [P] Create `src/bcs/prompt-registry/application/expand-characterization.test.ts` — for every shared fixture, asserts the new TypeScript `expand()`'s output matches the harness-recorded legacy output exactly (system message, user message, applied policies; objectives compared too even though it's a new field on the TS side, since legacy already returns it)

---

## Phase 7: Polish & Cross-Cutting

- [X] T014 Extend `src/bcs/prompt-registry/index.ts` to re-export `expand` and all new types/errors from `domain/expansion.ts`
- [X] T015 Extend `src/bcs/prompt-registry/CONTRACT.md`: add `objectives: string[]` to the `ExpansionResult` data contract (spec Clarification 2), and confirm the `expand()` row accurately describes the implemented behavior (no-user-ungoverned rule, depth-3 limit, placeholder degradation)
- [X] T016 Run `pnpm typecheck`, `pnpm lint`, and `pnpm vitest run src/bcs/prompt-registry` — fix any failures before considering this feature done

---

## Dependencies

```
T002 → T004 (nunjucks must be installed before the renderer file can import it)
T003 → T004, T006 (domain types needed by the renderer and expand.ts)
T004 → T006, T010 (renderer needed by expand.ts's basic render and its inclusion logic)
T005 → T007, T009, T011, T012, T013 (shared fixtures needed by every test)
T006 → T007
T006 → T008 (governance weaving extends the same file)
T008 → T009
T008 → T010 (inclusion resolution extends the same file, after governance weaving exists)
T010 → T011
T006, T008, T010 → T012, T013 (characterization needs the full implementation)
T001...T013 → T014 → T015 → T016
```

## Parallel Execution

Phase 2: T003, T004 can start in parallel once T002 is done; T005 can start anytime after T003.
Phase 3: T007 after T006.
Phase 4: T009 after T008.
Phase 5: T011 after T010.
Phase 6: T012 and T013 can be drafted in parallel, but T013 can't run for real until T012's harness exists and T010 is done.

## Implementation Strategy

**MVP = Phase 3 + Phase 4** (both P1: basic expansion and governed expansion together) — an expansion engine without governance woven in undersells the entire product's premise, per spec's own framing. Phase 5 (nested inclusion) and Phase 6 (characterization) are independently valuable increments layered on top; Phase 6 in particular is what actually proves this feature is done, not just passing its own tests.
