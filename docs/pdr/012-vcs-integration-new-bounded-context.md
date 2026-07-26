# PDR-012: New Bounded Context `vcs-integration`, Not an Extension of Distribution

**Status:** Accepted
**Date:** 2026-07-25

## Context

The product now needs to correlate skill usage with GitHub PRs — which governance-required skills ran on a branch, surfaced on the PR before merge. Distribution already talks to every external actor (REST clients, the `skillcanon` CLI, MCP), so it's the obvious place to bolt this onto by default. But Distribution's own contract is explicit: "no domain rules of its own... calls the appropriate domain context's application service" (`bcs/distribution/CONTRACT.md`). Matching commits to usage rows, evaluating required-skill policies, and deciding pass/fail for a PR is real domain logic, not protocol translation.

## Options Considered

### Extend Distribution to also own GitHub integration
Add GitHub App webhook handling, installation/repo-link storage, and PR evaluation logic directly into `bcs/distribution/`.
Pros: no new BC to stand up; Distribution already owns the external-facing route surface (`src/app/api/**`).
Cons: violates Distribution's own stated purpose (conformist consumer, no domain rules) — this would be the first real domain logic it owns; conflates "adapter that composes other contexts" with "context that owns new aggregates and external credentials"; Distribution's OWNERSHIP.md would need to absorb a second external system (GitHub, alongside none currently) with its own credential lifecycle (GitHub App private key, installation tokens), blurring what Distribution is actually responsible for.

### New bounded context `vcs-integration` (chosen)
A new context owning `Installation`, `RepoLink`, and `PrCheck` as its own aggregates, with GitHub's REST/webhook API isolated behind its own infrastructure layer — the same anti-corruption-layer pattern Billing & Entitlements already uses for Stripe (`architecture.md`: "Billing is the sole anti-corruption layer in front of Stripe — no other context imports the Stripe SDK").
Pros: keeps Distribution's contract honest (still no domain rules of its own); isolates GitHub-specific credentials/API shapes the same way Stripe is isolated; matches this repo's existing pattern for external-system integrations; named for the capability (`vcs-integration`) rather than the vendor (`github-integration`), consistent with every other BC's naming (`identity-access`, not `postgres-access`) and leaving room for a GitLab/Bitbucket adapter later without a context rename.
Cons: one more BC to reason about; its webhook route still has to live under Distribution's `src/app/api/**` folder ownership per `repo-structure.md`'s existing rule (thin handler, calls into `vcs-integration`'s application layer) — a small seam to keep straight, not a real cost.

## Decision

New bounded context `vcs-integration`. Its webhook route (`src/app/api/webhooks/github/route.ts`) is a thin Distribution-owned handler that calls straight into `vcs-integration`'s exposed `handleGithubWebhook()`, matching every other route in this repo.

## Consequences

- **Positive:** Distribution's contract stays accurate (still zero domain rules); GitHub's API/webhook shapes never leak past `vcs-integration/infrastructure/`; the BC-per-external-system pattern (Stripe → Billing, GitHub → vcs-integration) is now consistent and repeatable for a future integration.
- **Negative:** a seventh — eighth, counting this one — context for a solo maintainer to hold in their head; mitigated by how narrow its actual domain is (three aggregates, no recursive resolution logic like Governance's).
- **Risks:** if a second VCS provider is ever added, this BC's internal structure (one adapter today) needs to prove it actually generalizes rather than being GitHub-shaped underneath a generic name — not a concern to solve preemptively, flagged for whoever builds that adapter.
