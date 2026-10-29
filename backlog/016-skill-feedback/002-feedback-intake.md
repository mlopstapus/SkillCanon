---
epic: 016-skill-feedback
feature: 002-feedback-intake
status: open
dependencies: [001-serve-id-and-digest]
---

# Feedback Intake

## Requirements

- [ ] `POST /api/feedback` with `{serveId, kind: "signal" | "note", rating?: "up" | "down", text?}`. 404 for a serve id outside the caller's org; 422 for a note without text.
- [ ] MCP tool `sh-feedback` with the same shape, so an agent can file feedback right after using a skill.
- [ ] CLI `skillcanon feedback <serveId> --up|--down [--note "..."]`.
- [ ] Every filing writes an audit event; the feedback row stores the serve id, never a copy of the skill text.
