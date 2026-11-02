# PDR-020: Where Evals Run

**Status:** Accepted
**Date:** 2026-10-30

## Context

SkillCanon's stated posture is that it never calls an LLM: it serves governed skill content and the caller's own LLM does the work. Cross-model evals (epic 017) need model calls, so something has to make them, hold the credentials, and record results somewhere a reviewer can trust.

The 017/001 feature file recommended that the CLI run evals with the caller's own provider keys and upload results. The product owner decided otherwise (D4, 2026-10-30): evals run centrally, "a centralized service where the main service or runners execute these eval jobs. Somebody submits a skill update, evals kick off to validate it, and prior to any sort of merge of that skill update, we need the results from the evals."

## Options Considered

### A — The CLI runs evals with the caller's own provider keys and uploads results

Pros: the server stays LLM-free; no credentials stored server-side.
Cons: results are self-reported by whoever ran them, so they cannot gate anything; every author needs their own provider keys; results depend on each author's machine and model access.

### B — A server-side runner with bring-your-own keys stored per organization

Pros: results are produced by the platform.
Cons: every organization must store and rotate provider secrets; the key-custody and per-tenant billing surface is large for a self-hosted registry.

### C — Central runners against a provider pool the instance operator configures

Pros: one trusted execution path, so results can gate a skill update; authors never handle provider keys; one place to configure, rate-limit and audit provider access.
Cons: the main service now calls LLMs (scoped to eval jobs only); the operator carries provider cost.

## Decision

**Option C**, deviating from the 017/001 recommendation.

- **Execution.** The main service, or runners it manages, executes eval jobs. A job is created when a skill update (a new version) is submitted for evaluation.
- **Providers.** The instance operator configures a provider pool (credentials and allowed models). Users do not bring their own keys. Provider credentials are server-side secrets and never leave the server.
- **CLI.** The CLI only submits runs and fetches results. It never calls a model for evals.
- **Gate.** Eval results gate the merge of a skill update: results for the update's content must exist before it is merged. How strictly a given organization is held to this is decided in 017/005, which this PDR makes the intended default rather than an optional extra.
- **Scope of LLM use.** The "SkillCanon never calls an LLM" statement remains true for expansion, sync and distribution. Only the eval runner calls models, with one further exception added by 016/004 (below).

### Amendment (016/004, Drafted Improvements)

A skill owner may ask for a model-drafted improvement of a version from its open feedback notes. This is a second, owner-triggered model call (never automatic), sent to the same operator-configured provider and only for organizations that have opted in to third-party sends. Accepting a draft is a normal `publishVersion`, so any eval gate (017/005) applies to it. The provider comes from the organization's resolved pool (the admin page's Eval providers); `ANTHROPIC_API_KEY` is only a fallback when none is configured, and `DRAFTER_MODEL` can pick the model.

### Model naming

A model is identified as `<provider>/<model-id>` (for example `anthropic/claude-sonnet-5-5`), exactly the provider-pool entry that ran it.

### Comparison rule

Results are keyed by skill version, content digest (016/001) and model id. Results are never compared across different content digests: a comparison is only valid between results for the same content, and a version-to-version comparison shows both digests side by side rather than a delta computed across them.

## Consequences

- **Positive:** results are trustworthy enough to gate on; authors need no keys; one audited path to providers.
- **Negative:** the operator pays for model calls and must configure a provider pool before evals work; the server needs a job runner and job storage (017/003 and later).
- **Risks:** a runaway or abusive job can burn provider budget, so runner limits (concurrency, per-job token and time caps) are required before evals are exposed. Eval inputs are skill content and case data sent to third-party providers, which the operator must accept when configuring the pool.

## Related changes made in this decision

- `README.md` — the "never calls an LLM" sentence names the eval runner as the one exception.
- `backlog/017-cross-model-evals/` — EPIC overview now describes central execution; 001 archived; 003/005 are to be re-read against this PDR (CLI submits and fetches, results gate).
