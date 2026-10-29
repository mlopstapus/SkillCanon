---
epic: 017-cross-model-evals
feature: 003-skillcanon-eval
status: open
dependencies: [002-eval-case-format]
---

# skillcanon eval

## Requirements

- [ ] `skillcanon eval <slug> [--version N] --models <provider:model,...> [--judge <provider:model>]` expands the skill (governed), runs each case on each model, scores it and uploads one result row per case × model.
- [ ] Provider keys come from the environment (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, ...); none are sent to the server.
- [ ] `POST /api/skills/{name}/versions/{version}/eval-results` stores `{model, digest, caseId, passed, score, latencyMs, tokens}` and rejects a digest that does not match the version.
