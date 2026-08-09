# Epic 005: Governance

**Priority:** 5
**Status:** in-progress (003 closed 2026-08-09 — characterization suite done; 006 not started)
**Goal:** Port Policy, Objective, and the hierarchical resolution engine — the first of SkillCanon's two core-domain contexts — with characterization tests proving the new TS implementation matches the current Python behavior exactly before anything downstream depends on it.

## Overview

This is the highest-risk port in the whole refactor. The resolution engine's correctness (inherited-vs-local layering, priority ordering, inherited-wins-ties) is silent when wrong — a team seeing another team's policy, or a policy applying at the wrong priority, produces no error, just quietly incorrect governance. Per the architecture document's own risk callout, this gets characterization tests against the current Python `resolve_effective`/`resolve_all_policies` before the port is considered done, not just tests against the new implementation's own assumed-correct behavior.

## Features

- [x] [001 - Policy Model & CRUD](archive/001-policy-model-and-crud.md)
- [x] [002 - Objective Model & CRUD](archive/002-objective-model-and-crud.md)
- [x] [003 - Hierarchical Resolution Engine](archive/003-hierarchical-resolution-engine.md) — closed 2026-08-09: the characterization-suite AC (TS output vs. legacy Python `resolve_effective`/`resolve_all_policies`/`resolve_all_objectives`, matching prompt-registry's `expand-characterization.test.ts` precedent) is done, 7 scenarios all passing on first run
- [x] [004 - Governance Tenant Isolation Tests](archive/004-governance-tenant-isolation-tests.md)
- [X] [005 - Governance Views UI](archive/005-governance-views-ui.md)
- [ ] [006 - Project-Scoped Governance UI](006-project-scoped-governance-ui.md) — deferred out of 005, no project scope in that feature's source mockup

*Completed features are moved to `archive/` and checked off here.*

## Dependencies

- `backlog/002-identity-access/EPIC.md` (needs `getTeamChain`, org/user/team identifiers)
- `backlog/003-audit-compliance/001-audit-event-schema-and-write-path.md` (policy/objective mutations are audited)
- `backlog/004-app-shell-and-landing/EPIC.md` (feature 005's UI composes into that epic's shell)

## Notes

Feature 003 is the epic's centerpiece — do not let it be treated as "just another CRUD feature." Budget real time for characterization testing against the Python original.

**Added 2026-07-23**: feature 005 builds this epic's real, finished UI directly (mirroring `003-audit-compliance/003-audit-log-ui.md`'s pattern) rather than deferring it to a later redesign epic — see that feature for the concrete gaps its source mockup surfaced in features 001 and 003.
