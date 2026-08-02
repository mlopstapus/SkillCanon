---
epic: 008-distribution
feature: 001-rest-api-core-routes
status: open
dependencies: ["backlog/002-identity-access/EPIC.md", "backlog/005-governance/EPIC.md", "backlog/006-prompt-registry/EPIC.md", "backlog/000-foundations/004-api-and-error-conventions.md"]
---

# REST API Core Routes

Port the REST surface from the current Python `routers/*.py` — teams, projects, prompts, policies, objectives, workflows, api-keys — as Next.js route handlers calling into each BC's application-service contract, using the error-mapping approach from the API conventions foundations item.

## Requirements

- [ ] Route handlers for every resource currently exposed by `routers/{teams,projects,prompts,policies,objectives,workflows,apikeys,users}.py`, matching or improving on current URL/method conventions per `context/api-conventions.md`
- [ ] Every route authenticates via `authenticateSession` (cookie) for the web UI's own calls — **and calls it (plus `login`, `authenticateApiKey`, `acceptInvitation`, `logout`, and the org-bootstrap flow) with `shared/db/client.ts`'s `authDb`, never the ordinary `db`** — see `backlog/002-identity-access/008-authdb-consumer-handoff.md` and `bcs/identity-access/CONTRACT.md`'s per-function notes (011-tenant-isolation-rls)
- [ ] Every route handler calls only the owning BC's exposed contract functions — no direct DB/model access from Distribution (module-boundary lint enforces this)
- [ ] Shared error-mapping layer translates domain errors to the REST error shape from `context/api-conventions.md` consistently across all routes

## Acceptance Criteria

- [ ] Each ported resource's CRUD operations behave equivalently to the current Python API for the equivalent request (characterization-style comparison where practical)
- [ ] A domain error (e.g. "policy not found") produces the same error shape regardless of which route handler triggered it
- [ ] Module-boundary lint passes — no route handler imports a BC's schema/model files directly

## Open Questions

- None currently — this is a straight port plus the new error-shape consistency requirement.

## Dependencies

- All five prior bounded-context epics (002, 003, 004, 005, 006)
- `backlog/000-foundations/004-api-and-error-conventions.md`

## Technical Notes

This is the largest single feature in the epic by surface area — consider splitting into per-resource sub-tasks during implementation even though it's tracked as one feature file here (the resources map cleanly onto each owning BC's already-defined CRUD operations from prior epics, so there's little new design work, mostly wiring).
