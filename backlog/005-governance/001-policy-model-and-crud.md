---
epic: 005-governance
feature: 001-policy-model-and-crud
status: open
dependencies: ["backlog/002-identity-access/EPIC.md"]
---

# Policy Model & CRUD

Port `Policy` from the current Python `models.py`/`policy_service.py`'s create/get/update/delete/list operations, scoped under `Organization`. **Diverges from the Python original per [PDR-016](../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)**: the Python model's optional project scope is dropped entirely — `Policy` is always team-scoped, never project-scoped, in this port.

## Requirements

- [ ] `governance.policies` table: `id`, `organization_id`, `team_id` (**required, not nullable**), `name`, `description`, `enforcement_type` (`prepend`/`append`/`inject`/`validate`), `content`, `priority`, `is_active`, `created_at` — no `project_id` column
- [ ] Invariant: `team_id` must belong to the caller's `organization_id`
- [ ] CRUD operations: `createPolicy`, `getPolicy`, `updatePolicy`, `deletePolicy`, `listTeamPolicies` — no `listProjectPolicies` (removed; Policy has no project scope to list by)
- [ ] All mutations go through `withAudit()` — `PolicyCreated`/`PolicyUpdated`/`PolicyDeactivated` events per `bcs/governance/CONTRACT.md`

## Acceptance Criteria

- [ ] Creating a policy without a `team_id` is rejected
- [ ] Creating a policy with a `team_id` from a different organization is rejected
- [ ] `listTeamPolicies` only returns active policies, ordered by priority descending
- [ ] Every mutation produces a corresponding audit event

## Open Questions

- None currently.

## Dependencies

- `backlog/002-identity-access/EPIC.md`
- `backlog/003-audit-compliance/001-audit-event-schema-and-write-path.md`

## Technical Notes

Per tenet D2, the "same organization" invariant lives in this feature's application service, not in a router.

**Open question surfaced by `005-governance-views-ui.md` (2026-07-23)**: the `SkillCanon Governance.dc.html` mockup's "New policy" drawer only offers three enforcement-type choices (`prepend`/`append`/`inject`), omitting the fourth real value `validate`. Resolve whether `validate` needs distinct UI treatment (it doesn't fit the "before/after/into template" framing the other three share) before that feature finalizes its create-policy form — don't let the mockup silently become the de facto spec for a 3-value enum when the schema has 4.

**2026-07-29 (PDR-016)**: this feature (and its implementation in `src/bcs/governance/`) already existed with the original Python-matching project-scope design before PDR-016 — the table above and this note describe the *post-refactor* state; the actual migration (`drizzle/migrations/0015_governance_policies_drop_project_scope.sql`) and code changes were done as part of that PDR's follow-through, not as fresh work under this backlog item. `governance.objectives` is unaffected — it keeps its `project_id` scope.
