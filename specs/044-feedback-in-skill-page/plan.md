# Plan
- Migration 0035: `addressed_at timestamptz`, `addressed_in_version_id uuid` on `distribution.feedback`.
- distribution: repo `listForPrompt`, `downRatesByVersionIds`, `findNoteById`, `markAddressed`; app `listFeedbackForSkill`, `getDownRatesForVersions`, `markFeedbackAddressed` (authz: admin | user owner | team owner via `getTeam`); barrel + CONTRACT.
- Skill page: loader adds `feedback` to `PromptDetailData`; `prompt-detail-view` gets a `feedback` tab + panel (`feedback-panel.tsx`), server action `markFeedbackAddressedAction`.
- Skills list: `downRate` on `PromptListRow`, new column.
- Tests: Testcontainers (list/aggregate, mark addressed authz/cross-skill/cross-org, down rates), view tests (renderToStaticMarkup), e2e step.
