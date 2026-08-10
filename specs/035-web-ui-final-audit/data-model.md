# Phase 1 Data Model: Web UI Final Composition & Integration Check — Re-Verification

This feature introduces no application data model — no new database table, domain entity, or
persisted record. The two "entities" named in `spec.md`'s Key Entities section are audit
artifacts, not runtime data:

## Parity matrix row

Documentation-only, lives in `parity-audit.md` (produced during implementation, one row per
legacy route family — see `research.md` §2 for the current content).

| Field | Type | Notes |
|---|---|---|
| Legacy route family | string | e.g. "Teams — policy/objective CRUD" |
| Legacy path(s) | string | file path(s) under `legacy/frontend/src/app/*` |
| Classification | enum: `Rebuilt` \| `Rebuilt (replaced)` \| `Rebuilt (additive)` \| `Intentional exclusion` | No "Missing" value may remain once the audit is complete (FR-004) |
| Rebuilt destination / rationale | string | real path under `src/app/**`, or exclusion rationale |
| Owning epic/feature | string | for traceability back to the bounded context that built it |

## Smoke test run record

Documentation-only, lives in `quickstart.md`'s results section (produced during implementation —
one row per step of the User Story 4 flow).

| Field | Type | Notes |
|---|---|---|
| Step | enum: team \| project \| policy \| prompt \| expansion \| chain-authoring \| chain-run \| chain-run-history-view | Ordered sequence from `spec.md` User Story 4 |
| Method | enum: UI \| REST | All steps are UI except chain-run itself (REST, by design — see `research.md` §3) |
| Outcome | string | pass/fail plus a one-line observation (e.g. "applied policy appears in expansion result") |

No schema migration, no Drizzle table, no RLS consideration — this feature reads and exercises
existing, already-tenant-isolated tables and routes through their existing application-layer
functions; it adds none.
