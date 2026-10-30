# Plan
- Migration: `distribution.feedback_drafts` + `distribution.third_party_opt_in` (both RLS).
- Domain `improvement-draft.ts` (port, errors, `lineDiff`, `nextVersionLabel`); infra `anthropic-drafter.ts`, `feedback-drafts-repo.ts`; application `improvement-drafts.ts` + shared `assert-can-triage-skill.ts`.
- Skill page: loader adds drafts/draftable versions/drafting state; Feedback panel gets the Drafted improvements section; four server actions.
- Docs: PDR-020 amendment, README, distribution CONTRACT.
- Tests: Testcontainers (stub drafter), drafter with fake fetch, view tests, e2e (unavailable message).
