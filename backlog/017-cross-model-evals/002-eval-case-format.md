---
epic: 017-cross-model-evals
feature: 002-eval-case-format
status: open
dependencies: [001-pdr-where-evals-run]
---

# Eval Case Format

## Requirements

- [ ] Eval cases live with the skill version as a supporting file, `evals/cases.yaml`: each case has an `input`, and either deterministic `assert` checks (contains, regex, JSON schema) or a `rubric` for a judge model.
- [ ] Publishing validates the file's shape; a malformed file blocks publish with a 422.
