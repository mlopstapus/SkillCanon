---
epic: 016-skill-feedback
feature: 004-drafted-improvements
status: open
dependencies: [003-feedback-in-skill-page]
---

# Drafted Improvements

Group open notes by skill and version, have a model draft a diff to the skill, and let the owner accept it as a new version or dismiss it.

## Requirements

- [x] On a skill's Feedback tab, an owner (same rule as marking a note addressed) can ask for a drafted improvement of a version: the open (unaddressed) notes for that version plus the version's main file go to a model, which returns a proposed new main file and a short rationale.
- [x] The draft is stored (status pending), shows as a line diff against the version it was drafted from, and lists the notes it is based on.
- [x] The owner can accept (publishes the proposed main file as a new version through `publishVersion`, keeps supporting files, marks the source notes addressed in that version) or dismiss (draft kept as dismissed, notes stay open).
- [x] Only template-kind skills with a main file are draftable; a model failure or an unconfigured provider is reported, never stored as a draft.
- [x] Drafting needs the organization's third-party opt-in and an operator-configured provider; every request, accept and dismiss writes an audit event.

## Acceptance Criteria

- [x] With a stub model, drafting from two notes produces a pending draft; accepting it creates the next version and addresses both notes; dismissing leaves the skill unchanged.
- [x] With no provider or no opt-in, drafting is refused with a clear message and nothing is stored.
- [ ] Live call against a real provider: **needs Ben** (set `ANTHROPIC_API_KEY`, then an admin allows it on the Feedback tab and drafts a version with open notes). Not exercised in CI.

## Open Questions (decided by default, build proceeds; Ben may overturn)

1. **May SkillCanon call an LLM for drafting?** README/PDR-020 limit model calls to the eval runner. Default: yes, through the same operator-configured provider pool and under the same per-org opt-in (Ben #1697 q5); PDR-020 gets a one-line amendment in this PR.
2. **Which model?** Default: the first Anthropic entry of the pool; until the admin-page pool exists, env-configured (`ANTHROPIC_API_KEY`, `DRAFTER_MODEL`, default `claude-sonnet-5-5`). **Needs Ben:** set the key.
3. **Who may draft?** Default: skill owner, owning team's owner, org admin (the triage rule), not every member.
4. **Is accepting a draft a normal publish?** Default: yes, same `publishVersion` path, so the 017/005 eval gate applies to it once that lands.
5. **Cost control?** Default: one draft per request, at most 20 notes and 100k characters of context, 60 s timeout; no automatic drafting.
