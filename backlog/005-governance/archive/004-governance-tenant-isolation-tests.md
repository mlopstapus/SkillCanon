---
epic: 005-governance
feature: 004-governance-tenant-isolation-tests
status: done
dependencies: ["001-policy-model-and-crud.md", "002-objective-model-and-crud.md", "backlog/002-identity-access/007-tenant-isolation-tests-and-rls.md"]
---

# Governance Tenant Isolation Tests

Apply the RLS pattern and the shared cross-tenant-denial test helper (both built in `002-identity-access/007`) to `governance.policies` and `governance.objectives`, per tenets M1/M2/M3.

## Requirements

- [x] RLS policies enabled on `governance.policies` and `governance.objectives`
- [x] Every query in this epic's other features filters by `organization_id`, audited against this feature
- [x] M3 negative test per resource type: a user in org A cannot read or write org B's policy or objective by ID

## Acceptance Criteria

- [x] Cross-org access by ID to a policy or objective is denied, proven by test, for both the read and write paths
- [x] RLS independently blocks cross-org access even with the app-layer filter simulated as absent (same proof pattern as epic 002's feature 007)

## Open Questions

- None — reuses the established pattern.

## Dependencies

- `001-policy-model-and-crud.md`
- `002-objective-model-and-crud.md`
- `backlog/002-identity-access/007-tenant-isolation-tests-and-rls.md`

## Technical Notes

Reuses the shared test helper built in epic 002 rather than reimplementing the M3 pattern — if the helper's shape doesn't quite fit Governance's resource shapes, extend it rather than forking a parallel implementation.
