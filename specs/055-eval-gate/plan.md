# Plan 055
- Schema/migration 0043 `eval_gates` with RLS.
- Domain `eval-gate.ts`: `evaluateGate`, errors. Application `eval-gate.ts`: get/set, `gateHoldsPublish`, `submitGateRun`, `applyEvalGate`, `activateCandidateVersion`.
- Hooks: `publishVersion` (hold back and queue), `executeEvalRun` (apply gate at the end and on early failure).
- REST: `/api/skills/{name}/eval-gate`, `/api/skills/{name}/versions/{v}/activate`; errors `EVAL_GATE_INVALID`, `VERSION_NOT_CANDIDATE`.
- Tests: Testcontainers for hold/pass/fail/blocked/gate-off/override/authorization plus `evaluateGate` units.
