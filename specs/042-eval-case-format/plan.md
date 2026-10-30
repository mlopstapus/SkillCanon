# Implementation Plan: Eval Case Format
**Spec**: [spec.md](spec.md)

Add `domain/eval-cases.ts` in `src/bcs/prompt-registry` exporting `EVAL_CASES_FILE_NAME` and `validateEvalCases(content)`, which parses with the `yaml` package and throws the existing `InvalidVersionFilesError` (already mapped to 422 `INVALID_SKILL_VERSION_FILES`). `publishVersion` calls it when a supporting file has that name. `yaml` is added as a direct dependency (already in the lockfile transitively). No schema change, no migration, no route change. Pure domain function; tested through `publishVersion` per repo convention (no standalone domain tests).

Constitution check: no new layer or BC boundary crossed; CONTRACT.md gets a one-line note.
