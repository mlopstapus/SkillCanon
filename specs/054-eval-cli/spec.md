# Spec 054: Eval CLI and API-key scopes (017/003 part 2)

Backlog: `backlog/017-cross-model-evals/003-skillcanon-eval.md` part 2. Governs: PDR-020 (CLI only submits and fetches; users bring no keys), Ben's answers #1697 (10: editors and reviewers may start runs).

## Requirements
- FR-1 `skillcanon eval run <skill> <version> --models a,b [--judge m] [--wait]` queues a run; `--wait` polls to completion and exits 1 unless the run succeeded with every case passing.
- FR-2 `skillcanon eval show <skill> <version> <runId>` prints status and per case x model results.
- FR-3 The REST eval routes enforce API-key scopes: submit needs `evals:run`; reads need `evals:read` or `evals:run`. A browser session is unaffected. A key with neither gets 403.
- FR-4 A member may request `evals:run` (an exception to the members-read-only cap); skill access still decides who can actually run an eval. `evals:read`/`evals:run` appear in the key issue drawer.

## Notes
`ResolvedCaller` now carries `scopes` (undefined for sessions); `requireScope` is the shared check, only the eval routes use it today. No reviewer role exists (admin/member only); proposal stays: add `reviewer` to the role enum in a later PR.
