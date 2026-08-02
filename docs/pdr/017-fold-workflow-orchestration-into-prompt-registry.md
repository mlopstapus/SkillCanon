# PDR-017: Fold Workflow Orchestration into Prompt Registry as Skill Chains

**Status:** Accepted
**Date:** 2026-08-01

## Context

`007-workflow-orchestration` was designed as its own bounded context, owning a `Workflow` entity (an ordered list of skill-step references, each with `dependsOn` for input mapping) plus, in the not-yet-implemented `002-workflow-runner`, run-state persistence (`workflow_runs`/`workflow_run_steps`) for a client-driven, step-by-step execution loop built entirely on top of Prompt Registry's `expand()`. `001-workflow-model-and-crud` already shipped and merged to `main`: a live `workflow.workflows` table and `create-workflow.ts`/`update-workflow.ts`/`list-workflows.ts`.

While specifying `002-workflow-runner` (`specs/025-workflow-runner`), the question that surfaced was: what's the actual difference between "a workflow" and "a skill that strings multiple skills together"? Working through it: the two only differ in *when* composition happens.

- **Compile-time composition** (nested `{% include %}`, already built in `template-renderer.ts`): multiple skills' text assembled into one prompt, resolved in a single `expand()` call, one model invocation.
- **Runtime composition** (what Workflow Orchestration exists for): multiple *separate* model calls, where a later step's input can depend on an earlier step's *real generated output* — data that doesn't exist until the caller round-trips to a model and back. Static includes structurally cannot do this.

That's a real, worth-keeping distinction — but it's a distinction in *how a skill is executed*, not a reason for "workflow" to be a separate domain noun with its own bounded context, its own CRUD, and its own access-control/catalog machinery duplicating what `Prompt`/`PromptVersion` already do. A chain is still, conceptually, a skill — one whose version happens to be a list of steps instead of a template.

## Options Considered

### A. Status quo — keep Workflow Orchestration as a fully separate BC

Ship `002-workflow-runner` as speced, on top of the already-shipped `001-workflow-model-and-crud`.

Pros: zero rework of shipped code; clean BC isolation, each with a narrow purpose.
Cons: duplicates ownership/access-control/catalog machinery that `Prompt Registry` already has; two parallel "list what's runnable" and "run something" mental models for Distribution/UI/CLI to reconcile; a chain never gets Prompt Registry's versioning, sharing (subscribe/fork), or project-assignment capabilities without reimplementing each one a second time inside `workflow-orchestration`.

### B. Keep Workflow Orchestration as a separate BC, rename the vocabulary only

Rename `Workflow` → e.g. `SkillChain`, keep the schema and BC boundary as-is.

Pros: least rework; removes the misleading "Workflow" noun without a real migration.
Cons: doesn't fix the actual problem. Two BCs still separately implement ownership, catalog listing, and access control for what is one concept — the rename is cosmetic over a structural duplication.

### C. Fold entirely into Prompt Registry: a skill version is either a template or a chain

A `PromptVersion` becomes discriminated: a **template version** (`systemTemplate`/`userTemplate`, resolved via `expand()`, unchanged) or a **chain version** (an ordered list of skill-step references, resolved via a new client-driven run capability). Chain execution (`startSkillChainRun`/`advanceSkillChainRun`) becomes a Prompt Registry application capability, backed by new `prompt_registry.skill_chain_runs`/`skill_chain_run_steps` tables. The `workflow.*` schema and `bcs/workflow-orchestration/` BC are retired.

Pros: one registry, one CRUD/ownership/sharing/project-assignment/versioning model for every kind of skill, simple or chained. Chains inherit versioning, subscribe/fork, and project assignment for free — capabilities the shipped `Workflow` entity never had (it had no version history at all; `updateWorkflow` mutated `steps` in place). Removes an entire BC's worth of duplicate machinery, and the ongoing cost of keeping `Prompt Registry → Governance` and `Workflow Orchestration → Prompt Registry` in sync as two separate customer/supplier relationships. Matches how the product is actually being described to users: "skills that string multiple skills together," not two distinct nouns.
Cons: real migration cost — `001-workflow-model-and-crud`'s shipped code (`workflow.workflows` table, `domain/workflow.ts`, `application/{create,update,list}-workflow.ts`, `bcs/workflow-orchestration/CONTRACT.md`/`OWNERSHIP.md`) has to be reworked or removed, not just left alone. Chain steps become immutable per version (publish a new version to change them) instead of the shipped mutable-in-place `updateWorkflow` — a real caller-facing behavior change, though no caller (UI/Distribution) depends on the old behavior yet.

## Decision

**Option C.** `docs/architecture.md` already documents this repo's migration posture as "none needed — pre-launch, no production data" — that's exactly the condition under which undoing a shipped-but-wrong abstraction is cheapest. The cost of this migration only grows the longer `002-workflow-runner`, Distribution's `sh-workflow-run`, and any UI get built on top of a separate `Workflow` concept first. Catching it now, before `002-workflow-runner` is implemented (only its spec exists, `specs/025-workflow-runner`, never built), is strictly cheaper than catching it later.

## Consequences

- **Positive:**
  - One conceptual model — "skill" — for everything Distribution, the web UI, and the CLI need to list, run, and govern. No more "is this a skill or a workflow" branching for consumers.
  - Chains get real version history for free (a version's `steps` is immutable once published, exactly like a template version's content), fixing a real gap in the shipped `001-workflow-model-and-crud` design — a chain was never versioned there, only mutated in place.
  - Chains also inherit sharing (`subscribeSkill`/`forkSkill`) and project assignment (`assignSkillToProject`) for free — the shipped `Workflow` entity had neither, and would have needed each reimplemented separately inside `workflow-orchestration` to reach parity.
  - Removes an entire bounded context's worth of duplicate ownership/access-control/catalog code, and the `Workflow Orchestration → Prompt Registry` customer/supplier relationship entirely (one fewer cross-BC contract to keep stable).
  - Per-step governance (policy/objective application) is unaffected — each chain step already resolves independently through `expand()`, exactly as `002-workflow-runner`'s design already called for; this behavior carries forward unchanged.
- **Negative:**
  - Real rework: migrate `domain/workflow.ts`'s validation logic into Prompt Registry's domain layer; fold `create`/`update`/`list-workflow.ts` into Prompt Registry's version-publishing path; a new migration drops `workflow.*` and adds chain-version + run-table support to the `prompt_registry` schema; `backlog/007-workflow-orchestration/` is retired into `backlog/006-prompt-registry/`; `specs/025-workflow-runner` is discarded and rewritten as a Prompt Registry feature.
  - Chain steps become immutable per version — editing a chain's steps means publishing a new `PromptVersion`, not mutating one in place. This matches how every other skill edit already works in this codebase, but it is a real change from what `001-workflow-model-and-crud` shipped.
- **Risks:**
  - Touching `PromptVersion`'s shape touches `expand()`'s core data path. Mitigation: `expand()` itself stays entirely unchanged for template versions; the new run functions are a fully separate code path that only shares the `Prompt`/`PromptVersion` read layer, not `expand()`'s internals.
  - This is a multi-file migration (domain, application, infrastructure, schema, backlog, specs) touching already-shipped, merged code. Mitigation: implement it as its own backlog item under epic `006-prompt-registry` with a normal spec/plan/tasks cycle, not as an ad hoc inline refactor — preserves the review and test discipline this codebase already applies to schema changes.

## Related

- Supersedes the BC design in `007-workflow-orchestration`'s own `bcs/workflow-orchestration/CONTRACT.md`/`OWNERSHIP.md` (now marked superseded, pointing here).
- `specs/025-workflow-runner`'s functional requirements (sequential step resolution, `dependsOn`-based input mapping, the error-propagation guarantee, run-history persistence, dependency-graph validation at run start) remain the right requirements — they're carried forward into the replacement backlog item under `006-prompt-registry`, just re-homed onto `PromptVersion` instead of a standalone `Workflow`.
- [PDR-016](016-skill-ownership-sharing-and-project-assignment.md) — the ownership/sharing/project-assignment model a chain now inherits directly.
