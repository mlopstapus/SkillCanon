---
epic: 016-skill-feedback
feature: 002-feedback-intake
status: done
dependencies: [001-serve-id-and-digest]
---

# Feedback Intake

## Requirements

- [x] `POST /api/feedback` with `{serveId, kind: "signal" | "note", rating?: "up" | "down", text?}`. 404 for a serve id outside the caller's org; 422 for a note without text.
- [x] MCP tool `sh-feedback` with the same shape, so an agent can file feedback right after using a skill.
- [x] CLI `skillcanon feedback <serveId> --up|--down [--note "..."]`.
- [x] Every filing writes an audit event; the feedback row stores the serve id, never a copy of the skill text.
