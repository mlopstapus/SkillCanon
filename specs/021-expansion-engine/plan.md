# Implementation Plan: Skill Expansion Engine

**Branch**: `021-expansion-engine` | **Date**: 2026-07-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-expansion-engine/spec.md`

## Summary

Port `expand_prompt` from the legacy Python `prompt_service.py` into `prompt-registry` as `expand(db, params)` — the actual "run a skill" operation. Renders a skill's active version template via a sandboxed template engine, weaves in the acting user's effective Governance policies (content changes) and objectives (template-visible context only), resolves template-invoked nested skill references up to a fixed depth (3, matching legacy) with non-throwing placeholder degradation on depth-exceeded or not-found, and is characterization-tested against the legacy implementation. No acting user means no governance at all (spec Clarification 1) — a deliberate, intentional divergence from legacy's now-impossible owner-fallback. `ExpansionResult` gains `objectives: string[]` for full legacy-response parity (spec Clarification 2), requiring a small `CONTRACT.md` addition.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20)

**Primary Dependencies**: **Nunjucks** (new dependency — not yet in `package.json`; closest JS equivalent to Jinja2, matches the backlog item's own stated assumption), Vitest, `@/shared/db` helpers, `@/bcs/governance` (`resolveAllPolicies`, `resolveAllObjectives` — both already implemented and already correctly signatured post-PDR-016: `resolveAllPolicies(db, actor, userId)` with no `projectId`, `resolveAllObjectives(db, actor, userId, projectId?)` still takes it since `Objective` kept its project scope). `@/bcs/audit-compliance` is *not* used here — expansion is a pure read, no mutation, no audit event, matching legacy (no audit-style record exists for a read-only expand call either).

**Storage**: PostgreSQL — reads only, no new tables. Reads existing `prompt_registry.prompts`/`prompt_versions`.

**Testing**: Vitest, Testcontainers-backed integration tests (existing convention) **plus** a characterization fixture suite comparing output against the legacy Python `expand_prompt` (spec SC-007) — run the legacy function directly via a small one-off Python harness against the same fixture data, not by standing up the legacy server.

**Target Platform**: Linux server (Next.js API / service layer)

**Project Type**: Service library — no HTTP routes or UI in this feature (matches `018`/`020` precedent; Distribution's epic 008 owns actual route wiring).

**Performance Goals**: No new targets; this is the latency-sensitive hot path per `docs/architecture.md`'s own Read/write pattern note, but no SLO exists yet to design against (tracked there as an open question, not this feature's problem to solve).

**Constraints**: Template rendering must never execute arbitrary code and must error on an undefined variable (tenet S2) — achieved via Nunjucks compiled with `throwOnUndefined: true` and **no custom globals registered beyond the one `include_prompt` function this feature itself needs** (no `require`/`process`/filesystem access exposed to template authors — "sandboxing via minimal surface area," since Nunjucks has no literal `SandboxedEnvironment` class the way Python's Jinja2 does). Nested-inclusion depth fixed at 3 (legacy's hardcoded value, carried forward, not made configurable). Must not query `governance.*` tables directly (tenet D1) — only `resolveAllPolicies`/`resolveAllObjectives`.

**Scale/Scope**: Same organization scale as existing prompt-registry reads.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| P1 — Test-First Development | ✅ PASS | Integration tests per function, plus the characterization suite (spec SC-007) required before this feature is done |
| D1 — Domain-Driven Bounded Contexts | ✅ PASS | Governance consumed only via `resolveAllPolicies`/`resolveAllObjectives` (its exposed contract); no `governance.*` import anywhere in this feature |
| D2 — Domain Invariants in Domain Layer | ✅ PASS | Depth limit, placeholder-degradation rules, and the "no acting user → no governance" rule live in `domain/expansion.ts`/the `expand()` service, not duplicated per caller |
| M1/M2/M3 — Multi-Tenant Isolation | ✅ PASS | `expand()` resolves the skill and any nested skills scoped by the caller's own `organizationId` throughout; a nested reference cannot cross an organization boundary (it's a plain skill-name lookup within the same org, same as every other prompt-registry read) |
| S1/S2/S3 — Secure by Default | ✅ PASS | This is the feature S2 exists for — sandboxed rendering, `throwOnUndefined`, no exec surface exposed to template content |
| C1/C2 — Auditable (SOC2) | ✅ PASS (N/A) | `expand()` is a pure read with no mutation — matches legacy (no audit event exists for `expand_prompt` either) and this bounded context's existing convention (reads aren't audited, only writes are, per `withAudit`'s usage elsewhere) |

G1 (Feature-Gated by Entitlement) not applicable — internal library feature, no route/UI, same reasoning as `018`/`020`.

## Project Structure

### Documentation (this feature)

```text
specs/021-expansion-engine/
├── plan.md          ← this file
├── research.md      ← Phase 0 output
├── data-model.md     ← Phase 1 output
├── quickstart.md     ← Phase 1 output
└── tasks.md          ← Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
package.json                                          ← EXTEND: add `nunjucks` + `@types/nunjucks`

src/bcs/prompt-registry/
├── domain/
│   ├── prompt.ts                        (existing)
│   ├── subscription.ts                  (existing)
│   └── expansion.ts                      ← NEW: ExpansionResult/ExpandParams types, errors (ExpansionSourceNotFoundError — reused rejection for missing/deprecated skill), the `MAX_INCLUDE_DEPTH = 3` constant
├── infrastructure/
│   └── template-renderer.ts              ← NEW: thin Nunjucks setup (sandboxed config, the `include_prompt` global wiring) — isolated here so no other file touches the Nunjucks API directly
├── application/
│   ├── expand.ts                         ← NEW: `expand(db, actor, promptName, input, { userId?, projectId?, version? })`
│   ├── expand.test.ts                    ← NEW
│   ├── expand-characterization.test.ts   ← NEW: fixture-driven parity suite against the legacy Python implementation (spec SC-007)
│   └── expansion-test-helpers.ts         ← NEW: shared fixtures (skills with inclusions, policies of each enforcement type, objectives)
├── index.ts                               ← EXTEND: re-export `expand` and new types/errors
└── CONTRACT.md                            ← EXTEND: `ExpansionResult` gains `objectives: string[]` (spec Clarification 2)

legacy/backend/
└── scratch/expand_characterization_harness.py  ← NEW: standalone script invoking legacy `expand_prompt` directly against shared fixture data, run via `uv run` (feeds T013's parity assertions — not part of the legacy app itself, a throwaway aid for this one feature)
```

**Structure Decision**: Follows the existing `domain`/`infrastructure`/`application` layering. `template-renderer.ts` is a new, narrow infrastructure file specifically to keep the Nunjucks API (and its security-sensitive configuration) isolated in one place — no other file constructs a Nunjucks environment directly.

## Complexity Tracking

No constitution violations. One real new dependency: **Nunjucks is not currently installed anywhere in this repo** (confirmed via `package.json` grep) — despite the original backlog item's "Jinja2 → Nunjucks per PDR-001's assumption" framing, no PDR actually records this choice yet. This plan treats it as a settled implementation detail (closest JS equivalent to Jinja2's syntax, matches the backlog's own stated assumption, actively maintained) rather than reopening it as a fresh architectural decision — but flags that a following PDR entry may be warranted if a future session wants this formally recorded outside this feature's own plan.md.
