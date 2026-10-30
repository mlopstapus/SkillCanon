# Spec 055: Eval gate on activation (017/005)

Backlog: `backlog/017-cross-model-evals/005-optional-publish-gate.md`. Governs: PDR-020, Ben's answers #1697 (6: default off until cases and a pool exist; 7: override by admin or skill owner; 8: keep unactivated candidates; 9: no regression tolerance).

## Requirements
- FR-1 Per-skill gate (`eval_gates`, migration 0043): enabled, models, min pass rate (default 100, i.e. no tolerance). Admin or skill owner sets it. It can only be enabled when the org opted in to evals, the pool covers the models, and the active version has `evals/cases.yaml`.
- FR-2 With the gate on and a version already serving, publishing stores a candidate and does not change the active version; a run for the gate's models is queued. First version always activates.
- FR-3 When a run on the candidate finishes, `applyEvalGate` activates it if every gate model meets the threshold, else records why. Only that run's own results (its content digest) are used. Candidates nobody activates are kept.
- FR-4 If the run cannot be queued (no pool, model gone, no cases) the candidate stays and an `eval_gate.blocked` event records the reason; the publish response carries `candidate: true` and `gate`.
- FR-5 An admin or the owner may activate a candidate with a reason (`POST .../versions/{v}/activate`), audited as `eval_gate.overridden`.
- FR-6 Audit events: `eval_gate.enabled|disabled|candidate_created|blocked|passed|failed|overridden`, plus `prompt.version_activated`.
- FR-7 Gate off: publishing is unchanged.

## Out of scope (follow-up)
Gate settings panel and candidate badge on the skill page (waiting on the matrix PR #132 to avoid editing the same files). The API is complete: `GET/PUT /api/skills/{name}/eval-gate`.
