# Research: Skill Expansion Engine

## Decision: Nunjucks as the template engine, configured for minimal exec surface

**Decision**: Use Nunjucks (`nunjucks` npm package), instantiated with `throwOnUndefined: true` and `autoescape: false` (output is plain text sent to an LLM, not HTML), and register **only** the one custom global this feature needs (`include_prompt`) — never `require`, `process`, filesystem access, or any other Node built-in as a template global.

**Rationale**: Nunjucks is the closest JS-ecosystem equivalent to Jinja2 (same `{{ }}`/`{% %}` syntax, same general semantics), matching the legacy backlog item's own stated assumption ("Jinja2 → Nunjucks"). It has no literal `SandboxedEnvironment` class the way Python's Jinja2 does, but its compiled-template execution model has no ambient access to the host environment unless a template global explicitly exposes it — so "sandboxing" here means **minimal surface area** (never registering anything dangerous), not a distinct security mode to enable. `throwOnUndefined: true` is Nunjucks' direct equivalent of Jinja2's `StrictUndefined` — an undefined variable reference throws instead of silently rendering empty.

**Alternatives considered**: Handlebars (rejected — no include/macro model as flexible as what `include_prompt`'s custom-function approach needs, and its "no logic" philosophy fights the legacy Jinja-style templates being ported). A hand-rolled minimal template substitution (rejected — reinvents variable scoping/control flow for no reason when a mature library already exists and matches the legacy syntax closely enough to ease the characterization-porting work).

**Confirmed via `package.json` grep**: no templating library is installed in this repo yet — this is a real new dependency this feature adds, not something already available to reuse.

## Decision: `include_prompt` is a template-invoked function, not automatic inclusion

**Decision**: A skill's template pulls another skill in by calling `include_prompt('other-skill-name')` from inside the template itself (a Nunjucks global function registered per-render). It is never automatic — a skill with no `include_prompt(...)` call anywhere in its template has zero nested inclusions, full stop.

**Rationale**: Read directly from the legacy implementation (`legacy/backend/src/spechub_server/services/prompt_service.py`'s `_build_include_prompt`/`_prefetch_included_prompts`) rather than inferred from the backlog item's prose, which described this more vaguely as "recursive prompt-inclusion resolution." The legacy code: (1) regex-prescans a template's raw text for `include_prompt(['"]([a-z0-9-]+)['"]\)` calls before rendering, to prefetch every referenced skill's content up front; (2) registers a real `include_prompt` callable as a Nunjucks/Jinja global during actual rendering, which looks up the prefetched content by name.

**Alternatives considered**: None — this is a faithful-port feature; the mechanism is exactly what legacy does, not a design choice being made fresh.

## Decision: Depth-exceeded and not-found both degrade to an inline placeholder, never an error

**Decision**: `include_prompt('name')` called at or beyond depth 3, or referencing a name with no matching skill, returns a plain string (e.g. `[include_prompt('name'): max depth (3) exceeded]` / `[include_prompt('name'): skill not found]`) that gets rendered inline as ordinary output text — it never throws, and it never aborts the rest of the expansion.

**Rationale**: Exact legacy behavior, confirmed by reading `_build_include_prompt` directly. This is a real, load-bearing design choice worth preserving rather than "fixing" to throw instead — a runaway or cyclic inclusion chain degrading to visible text is a much better caller experience than caller code that must catch a depth-exceeded exception it never expected. The placeholder is exactly the mechanism spec SC-003/SC-004 depend on ("completes successfully... rather than erroring or hanging").

**Alternatives considered**: Throwing on depth-exceeded — rejected; breaks characterization parity with legacy (spec SC-007) and would be a strictly worse caller experience for no benefit.

## Decision: No acting user → fully ungoverned, no fallback (spec Clarification 1)

**Decision**: `expand()`'s `userId` parameter is optional; when omitted, `resolveAllPolicies`/`resolveAllObjectives` are never called at all — the expansion proceeds as a plain, ungoverned render.

**Rationale**: Already resolved in the spec's own Clarifications section. Legacy's fallback ("use the prompt's owner as the effective user") is structurally impossible to replicate once a skill's owner can be a team (PDR-016) — there's no single user identity to substitute. Per PDR-016's own principle (governance is always about a specific invoking identity), the correct generalization isn't "invent a partial fallback for the user-owner case only" (spec's rejected Option C) — it's "no acting user means no governance," full stop, applied uniformly regardless of the skill's owner type.

**Alternatives considered**: See spec.md's Clarification 1 options B/C — both rejected there already; not re-litigated here.

## Decision: `ExpansionResult` gains `objectives: string[]` (spec Clarification 2)

**Decision**: Add `objectives: string[]` to the `ExpansionResult` interface (`bcs/prompt-registry/CONTRACT.md`, `domain/expansion.ts`), populated from `resolveAllObjectives`'s return value directly (it already returns `Promise<string[]>` of titles — no shape translation needed).

**Rationale**: Already resolved in the spec's own Clarifications section — full legacy-response parity, since `resolveAllObjectives` already exists with exactly the right return shape (confirmed by reading `governance/application/resolve-all-objectives.ts` directly). This is a backward-compatible addition to an interface last touched in the merged PDR-016 commit — no existing consumer breaks, since none reads `ExpansionResult` yet (`expand()` doesn't exist until this feature).

**Alternatives considered**: See spec.md's Clarification 2 option B — rejected there already.

## Decision: `projectId` is real, but scoped only to objective resolution (FR-015, caught via `/speckit-analyze`)

**Decision**: `ExpandParams` keeps an optional `projectId`, forwarded only into `resolveAllObjectives(db, actor, userId, projectId)` — never into `resolveAllPolicies(db, actor, userId)`, which has no project-scope parameter at all post-PDR-016.

**Rationale**: An initial pass of this spec dropped `projectId` from `ExpandParams` entirely, which would have silently made project-scoped objectives unreachable through `expand()` even though `Objective` explicitly kept its project scope under PDR-016 (only `Policy` lost it). Legacy `expand_prompt` forwards `data.project_id` into both policy and objective resolution; the TS port intentionally forwards it into only one of the two, matching each one's actual current scope rather than legacy's now-partially-obsolete uniform treatment.

**Alternatives considered**: Dropping `projectId` entirely (the initial, incorrect draft) — rejected once caught, since it's a real capability regression with no compensating benefit.

## Decision: `expand()` performs no audit write

**Decision**: `expand()` does not call `withAudit`/`record` — it is a pure read with no side effect to log.

**Rationale**: Matches legacy exactly (no audit-style record exists anywhere for `expand_prompt`), and matches this bounded context's own established convention — every `withAudit` call elsewhere in `prompt-registry` accompanies an actual mutation (`createPrompt`, `publishVersion`, `subscribeSkill`, etc.); reads (`getPrompt`, `listPrompts`) never audit. `PromptUsage` telemetry (a *different*, already-existing mechanism owned by Distribution, per `docs/architecture.md`'s Data Architecture table) is what records that an expansion happened, once Distribution's epic 008 actually wires a route to this function — not this feature's concern.

**Alternatives considered**: Adding a new `SkillExpanded` audit event — rejected; expansion isn't a mutation, and audit events in this codebase are reserved for state changes (tenet C1/C2's own framing: "every mutation... MUST be captured").
