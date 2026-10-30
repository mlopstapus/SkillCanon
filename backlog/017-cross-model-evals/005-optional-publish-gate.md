---
epic: 017-cross-model-evals
feature: 005-optional-publish-gate
status: open
dependencies: [004-results-matrix]
---

# Eval Gate on Merging a Skill Update

Rewritten for D4: "prior to any sort of merge of that skill update, we need the results from the evals." Publishing a version makes it the active one today, so activation is the merge point. Eval results (from centrally executed runs, 003) gate that activation. This replaces the earlier opt-in-only framing: the gate is the intended way to ship a skill update once evals are configured, while staying switchable per skill so a skill without eval cases is not blocked forever.

## Requirements

- [ ] A per-skill gate setting: models that must be evaluated and a minimum pass rate. When the gate is on, publishing a new version creates it as a candidate and does **not** make it active; the previous active version keeps serving.
- [ ] Publishing a version with the gate on automatically submits an eval run for the gate's models (003). When the run succeeds and every named model meets the threshold, the candidate becomes active; if any model falls short, or the run fails, it stays a candidate and the owner sees why.
- [ ] A candidate can also be activated manually by an org admin or the skill owner, with the override recorded in the audit log with the reason.
- [ ] The gate compares only results for the candidate's own content digest.
- [ ] If the provider pool is not configured, a skill with the gate on cannot activate new versions through the gate, and the owner is told to configure the pool or switch the gate off. Existing active versions keep working.
- [ ] Gate off is the default for skills that have no `evals/cases.yaml`; the setting is visible and editable on the skill page.
- [ ] Gate decisions (candidate created, passed, failed, overridden) are audit events.

## Acceptance Criteria

- Gate on, passing run: the new version becomes active without further action.
- Gate on, failing or errored run: the previous version stays active and the failure reason is shown.
- Gate off: publishing behaves exactly as today.
- Admin override activates a candidate and writes an audit event with the reason.

## Decisions (Ben, 2026-10-30)

- Gate default: **off until the skill has eval cases and a provider pool exists** (and the org has opted in to evals).
- Override: an **org admin or the skill's owner** may activate a candidate manually; the override and its reason are audited.
- A candidate nobody activates is **kept**.

## Dependencies

- 003 runner and results, 004 matrix (for showing candidate state). Needs a migration for the gate setting and candidate state: coordinate numbering with other lanes.
