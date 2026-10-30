# Feature Specification: AI Policy & Tenet Interview Assistant

**Feature**: `046-ai-policy-interview` · **Backlog**: `backlog/012-ai-and-mcp-governance-tools/002-ai-policy-and-tenet-interview-assistant.md` · **Depends on**: PR #109 (eval provider pool and org opt-in), which must merge first.
Answers to the open questions are the defaults recorded in the backlog file.

## User Scenarios
### US1 — An admin drafts governance by chatting (P1)
On a team's Governance page an admin opens "Draft with AI", describes goals and constraints, and gets a short reply plus draft policies/objectives. Each draft has "Review & create", which opens the normal create drawer pre-filled. Nothing is created until the admin submits that drawer.
### US2 — Clear refusals (P1)
If the org has not opted in, no provider is configured, or the user is not an admin, the panel shows a plain message and no model call is made.

## Requirements
- **FR-001** One interview turn takes the conversation so far and returns `{reply, drafts, tokens}`; drafts are policies (name, enforcement type, content) or objectives (title, description).
- **FR-002** The assistant never creates or changes governance; applying a draft is the existing create path.
- **FR-003** The model is told the caller's effective policies/objectives so it avoids duplicates.
- **FR-004** Uses the eval provider pool (`getEvalProviderPool`, default judge or first model) and the per-org eval opt-in (`getEvalsEnabled`) as the data-send consent. No second key store.
- **FR-005** Admin only. Conversation is capped (last 20 messages, 4000 chars each).
- **FR-006** Model output that is not valid JSON becomes a plain reply with no drafts; malformed drafts are dropped.
- **FR-007** Token usage per call is logged with the org and user; no billing wiring.

## Assumptions
No migration. The panel is shown to everyone on the page; non-admins get a message when they send.
