# Plan: Normalise Skill Version Labels

- `prompt-registry/domain/prompt.ts`: add `normalizeVersionLabel(label)` (`/^[vV](?=\d)/` stripped, trimmed).
- `publish-version.ts`: normalise `params.version` once; use for duplicate check, insert, errors.
- `prompt-versions-repo.ts` `findVersionByPromptAndLabel`: normalise input; also match legacy stored label (`version IN (norm, 'v'||norm)`) so unmigrated collision rows stay reachable.
- Migration `drizzle/migrations/00NN_prompt_registry_normalise_version_labels.sql` (data-only, `drizzle-kit generate --custom`): updates three tables; `prompt_versions` guarded by `NOT EXISTS` sibling.
- UI: `metrics/page.tsx` drops hardcoded `v`; `prompts/actions.ts` and `prompts/[name]/prompt-detail.tsx` next-label helpers accept `^v?\d+$` and return a plain number; literal `"v1"` publishes become `"1"`.
- Tests: domain/publish-version test for normalisation + duplicate across forms + lookup; migration exercised by Testcontainers suite; flip e2e `it.fails` (vv1).
- Migration numbering: lane B takes 0031; regenerate after merging origin/main if theirs lands first.
