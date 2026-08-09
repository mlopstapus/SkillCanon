---
epic: 005-governance
feature: 003-hierarchical-resolution-engine
status: done
dependencies: ["001-policy-model-and-crud.md", "002-objective-model-and-crud.md"]
---

# Hierarchical Resolution Engine

Port `resolve_effective` and `resolve_all_policies` (and the equivalent objective resolution) from the current Python `policy_service.py`/`objective_service.py` — the two-layer inherited/local resolution walk that is SkillCanon's actual differentiator. This is the single highest-risk piece of the entire refactor: correctness here is silent when wrong.

## Requirements

- [ ] `resolveEffectivePolicies(orgId, userId)`: walks `getTeamChain`, splits into `inherited` (ancestor teams, immutable) and `local` (user's own team, mutable). **No `projectId` parameter** — per [PDR-016](../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md), Policy is purely team + invoking-user scoped, unlike the original Python model this was ported from (which did have a project layer)
- [ ] `resolveEffectiveObjectives(orgId, userId, projectId?)`: same shape for objectives — **`Objective` keeps its `projectId` scope**, unchanged by PDR-016; only `Policy` lost it
- [ ] `resolveAllPolicies(orgId, userId)`: single merged list, priority descending, **inherited wins ties** — matching current Python tiebreak behavior exactly (minus the removed project layer)
- [ ] Read-fresh, never cached — no memoization that could serve a stale policy set within or across requests
- [ ] **New (2026-07-23, driven by the `SkillCanon Governance.dc.html` mockup — see `005-governance-views-ui.md`):** a per-node aggregate count — `countLocalPoliciesAndObjectives(orgId, teamOrUserId)` or equivalent — for the scope-tree sidebar's local-count badges. Doesn't need to be a new resolution primitive; a simple `count(*) ... where team_id = $1` per table is sufficient, but it doesn't exist as a named, tested query today

## Acceptance Criteria

- [x] **Characterization test suite**: a representative set of team hierarchies + policy/objective fixtures run through both the current Python implementation and the new TS implementation, asserting identical output for every fixture, before this feature is considered done — done 2026-08-09, matching prompt-registry's `expand-characterization.test.ts` precedent exactly: `legacy/backend/scratch/governance_characterization_harness.py` (run once via `uv run`, records `governance_characterization_output.json`) + `src/bcs/governance/application/resolve-characterization.test.ts` (reads the recorded JSON, no live Python at `vitest` time). 7 scenarios, all passing on first run: 3 policy (basic local sort + inactive exclusion, 3-level inherited chain, same-priority tie-break) and 4 objective (3-level inherited chain, team+personal combination, project-scope presence/absence, full combined `resolveAllObjectives` flat ordering). Per PDR-016, the policy scenarios never exercise `project_id` — the new TS `Policy` model dropped project scope entirely, a documented, accepted divergence from the legacy shape this was ported from — `Objective` kept its `projectId` scope and is fully exercised.
- [x] A policy at the same priority as an inherited policy resolves with the inherited one taking precedence, matching current behavior — verified: `resolve-effective-policies.test.ts`'s "matches legacy priority ordering with inherited policies winning ties"
- [x] A user's own local policy correctly overrides/coexists with inherited ancestor policies per the existing two-layer model — verified: `resolve-effective-policies.test.ts`'s "matches legacy inherited/local policy resolution across the team chain"
- [x] No test or code path introduces caching of resolution results — verified: no memoization/cache reference anywhere in `resolve-*.ts`

## Open Questions

- None — behavior is fully specified by the existing Python implementation; the job here is faithful port plus test-proven equivalence, not redesign.

## Dependencies

- `001-policy-model-and-crud.md`
- `002-objective-model-and-crud.md`
- `backlog/002-identity-access/002-team-hierarchy.md` (`getTeamChain`)

## Technical Notes

Per `context/architecture.md`'s explicit risk callout and `docs/pdr/001-typescript-unification.md`'s mitigation plan, this feature is where characterization testing matters most in the entire rewrite. Per `bcs/governance/CONTRACT.md`'s Stability Guarantees, resolution must remain read-your-writes consistent within a request — a stale policy silently applied is a correctness bug, not a performance tradeoff, so no caching layer belongs in this feature regardless of how tempting it is for the recursive team-chain walk's performance.
