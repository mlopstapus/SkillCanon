---
epic: 017-cross-model-evals
feature: 002-eval-case-format
status: done
dependencies: [001-pdr-where-evals-run]
---

# Eval Case Format

## Requirements

- [x] Eval cases live with the skill version as a supporting file, `evals/cases.yaml`: each case has an `input`, and either deterministic `assert` checks (contains, regex, JSON schema) or a `rubric` for a judge model.
- [x] Publishing validates the file's shape; a malformed file blocks publish with a 422.

Implemented in `src/bcs/prompt-registry/domain/eval-cases.ts`, called from `publishVersion`; see `specs/042-eval-case-format/`. Per PDR-020 (D4) this defines and validates the format only; evals are executed centrally by the server, not by the CLI. Assertion types: `contains`, `regex`, `json_schema`; a case has exactly one of `assert` or `rubric`.
