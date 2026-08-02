# Contract: Skill Chains

This feature has no new external (customer-facing) HTTP API — it ships entirely as `src/bcs/prompt-registry` application functions, matching this repo's established precedent that Identity & Access / Prompt Registry features build the bounded-context layer and leave HTTP/MCP wiring to a later `008-distribution` feature. Its "contracts" are the new/extended exposed functions' obligations, the access-control model they share, and the data-shape guarantees callers (eventually Distribution, today only tests) can rely on.

## `publishVersion(db, actor, params, auditContext?)` — extended

1. **Exactly one version shape.** `params` MUST specify either `steps` (a chain version) or at least one of `systemTemplate`/`userTemplate` (a template version), never both, never neither. Violating either rule throws `InvalidVersionShapeError` before any DB write.
2. **`kind` is never caller-supplied.** It's derived from which shape was given — there is no `kind` field on `PublishVersionParams`.
3. **A chain version's `steps` are stored exactly as submitted** — no existence check against Prompt Registry for `promptName`, no cycle/position validation. This is deliberate (backlog-mandated) deferral to run-start time, not an oversight.
4. **Immutability is unchanged** — a chain version, like a template version, can never be updated in place; a new version must be published to change steps.

## `expand(db, params)` — extended

1. **Rejects a chain-kind version** the resolved version (explicit `version` or the skill's active/latest) has `kind: "chain"` → throws `ExpansionSourceNotFoundError`, the exact same error a nonexistent/deprecated/no-published-version skill would produce. A caller cannot distinguish "this is a chain, use `startSkillChainRun` instead" from "this doesn't exist" from `expand()`'s error alone — by design, matching every other unresolvable-version case this function already collapses into one error type.
2. **No other behavior change.** Template-version expansion, governance, and nested-include resolution are byte-for-byte unchanged.

## `startSkillChainRun(db, actor, promptName, version?): Promise<StartRunResult>`

1. **Resolution**: looks up the named prompt + version exactly like `expand()`'s own version-resolution helper (reused, not reimplemented) — nonexistent prompt, no published versions, or a deprecated prompt all produce `PromptNotFoundError`/`ExpansionSourceNotFoundError`-equivalent rejection. A version that resolves but is `kind: "template"` (not a chain) throws `NotAChainVersionError`.
2. **Authorization**: the caller must be in the same accessible-skill set `listPrompts` already computes for that org member (owner, own team, direct subscription, or a project they're a member of that subscribes) — no chain-specific authorization concept. A caller without access gets `PromptNotFoundError`, indistinguishable from the skill not existing.
3. **Dependency validation, before any row is written**: every step's `dependsOn` must reference only step ids that exist, aren't the step's own id, and sit strictly earlier in the array — and no two steps may share an `id`. Any violation throws `InvalidChainDependencyError`; no `skill_chain_runs` row is ever created for an invalid chain (FR-006, SC-006).
4. **Zero-step chain**: creates a run already `status: "completed"`, writes the `skill_chain_run.completed` audit event, returns `{ runId, done: true }` — no step is ever resolved (FR-010).
5. **Otherwise**: creates the run (`status: "in_progress"`), resolves step 0 via `expand()` internally (never a cross-BC call — same-module reuse of this BC's own version-resolution + rendering path), persists the `skill_chain_run_steps` row, returns `{ runId, step }`.
6. **Never resolves or stores anything resembling a model's actual output** — only the content sent for step 0.

## `advanceSkillChainRun(db, actor, runId, report): Promise<AdvanceRunResult>`

1. **Access-scoped, not starter-scoped**: any org member with access to the underlying chain skill may advance any of its runs, not only the user who called `startSkillChainRun` (clarify-session decision) — including resuming a run that's been idle indefinitely (no auto-expiry).
2. **Serialized per run, and step-addressed**: `report` carries the `stepIndex` it's for (a refinement beyond the originally documented `{status, output?, error?}` shape — research.md), compared against the run's actual current step under a row lock. A second, racing, or stale-duplicate call — including an exact retry of the same report — is rejected with `RunStepConflictError` whenever its named `stepIndex` no longer matches, never silently applied to whatever step happens to be current by the time it runs (FR-007a, SC-007).
3. **Terminal-state rejection**: a run whose `status` is already `"completed"`, `"failed"`, or `"abandoned"` rejects the call with `RunAlreadyFinishedError` — never a silent no-op success (FR-007b, SC-008).
4. **Failure isolation**: a step reported `status: "error"` never lets a later step's resolved `input` show fabricated or stale data for that dependency — the later step's `input[stepId]` is always `{ status: "error", output: null }` in that case, regardless of what (if anything) the caller supplied as `report.output` for the failed step (that value, if any, is still persisted to `reported_output` for history purposes, but never surfaced as if it were a real result to a dependent step).
5. **Run always walks every step to the end**, regardless of intermediate failures — only the *overall* run status (`"completed"` vs `"failed"`) reflects whether any step along the way failed.
6. **Terminal transition fires exactly one audit event** (`skill_chain_run.completed` or `skill_chain_run.failed`), transactionally with the status update.
7. **Never stores or returns anything resembling a model's actual output** — only what was sent for the next step and what the caller self-reported for the one just advanced past.

## `abandonSkillChainRun(db, actor, runId, auditContext?): Promise<void>`

1. Same access-scoping, row-locking, and terminal-state rejection as `advanceSkillChainRun` (items 1–3 above) — this is a sibling terminal transition, not a variant of a step report.
2. Transitions `status` to `"abandoned"`, sets `completed_at`, and fires the `skill_chain_run.abandoned` audit event transactionally.
3. The pending step (if any) is left with `reported_status: null` permanently — a distinct, meaningful "the run was ended before this step's outcome was ever reported" state in run history, not conflated with a reported failure.

## `listSkillChainRuns(db, orgId, promptId): Promise<ChainRunSummary[]>` / `getSkillChainRun(db, orgId, runId): Promise<{ run: ChainRunSummary; steps: ChainRunStepRecord[] } | null>`

1. **Pure reads** — no `expand()` call, no state transition, safe for a UI to poll or load repeatedly (FR-013).
2. **Org-scoped, cross-org access denied.** `getSkillChainRun` for a run belonging to a different organization returns `null` (RLS makes the row invisible before any app-layer comparison runs) — the same not-found shape as a nonexistent run id, never a distinguishing error (SC-005).
3. **`listSkillChainRuns` returns every run for the given chain skill**, most-recent-`startedAt`-first, regardless of the calling org member's own accessible-skill set — matching this codebase's precedent for other `list*ForOrganization`/`list*ForSkill`-style reads (`listSubscriptionsForSkill`, `listProjectSkillAssignmentsForOrganization`), which are pure org-scoped reads without a further per-caller accessibility filter, since the caller reaching this function at all already implies they got here through an already-authorized surface (a future UI page for a chain the caller can already see).

## Access control summary (new vs. inherited)

| Operation | Access rule | New or inherited |
|---|---|---|
| Publish a chain version | Same as publishing a template version today (unchanged) | Inherited |
| Share/fork/assign-to-project a chain version | Identical to any other skill — `subscribeSkill`/`forkSkill`/`assignSkillToProject` (unmodified) | Inherited |
| Start / advance / abandon a run | Caller must be in the skill's accessible set (owner, own team, subscribed, project-member-subscribed) | New (this feature) |
| Read a run / run history | Org-scoped only (RLS), no further per-skill accessibility filter | New (this feature) |

## Data contract stability

`ChainStep`'s three fields (`id`, `promptName`, `promptVersion?`, `dependsOn`) and `ChainStepReport`'s two fields (`status`, `output?`/`error?`) match CONTRACT.md's already-published shapes exactly — no breaking change to what was already documented before this feature's implementation. `StartRunResult`/`AdvanceRunResult`'s union shapes are new documentation (CONTRACT.md is updated in this same change, per plan.md Complexity Tracking #1/#2), not a breaking change to anything previously shipped (nothing shipped yet).
