# Plan
- `distribution/application/governance-interview.ts`: `runGovernanceInterview(db, actor, messages, pool?)`, `parseInterviewReply`, `AiNotEnabledError`, `AiPoolNotConfiguredError`; exported from the distribution barrel.
- `teams/[teamId]/actions.ts`: `interviewAction` (admin check, tenant context).
- `teams/[teamId]/ai-draft-panel.tsx` (`AiDraftPanelView` + thin wrapper) rendered by `governance-page.tsx`; "Review & create" prefills the existing policy/objective drawers.
- Tests: Testcontainers test with a stub pool (drafts, opt-in refusal, no-pool refusal, parser); panel view markup test.
