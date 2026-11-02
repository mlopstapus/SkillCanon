# Plan 054
- CLI: `commands/eval.ts` (run, show, formatting, exit code), client `submitEvalRun`/`getEvalRun`; registered in `index.ts`. Tests use a local HTTP server like `feedback.test.ts`.
- Server: `ResolvedCaller.scopes`, `requireScope`, applied in the eval routes; `isScopeAllowedForRole` admits `evals:run` for members; drawer mirrors it.
- Tests: CLI unit tests, route scope test (403/403/202), member key test.
