# Quickstart: Skill Chain Views UI

Validates the feature end-to-end against a real dev database. Assumes `023-prompt-registry-views-ui` is already usable (Prompts pages exist and a template-kind skill can already be created).

## Prerequisites

- `pnpm install` (once)
- Postgres reachable per `docker-compose.yaml` defaults (or a remapped port per `CLAUDE.md` if another project already occupies 5432/3000 locally)
- `pnpm db:migrate` applied (no new migration from this feature — `skill_chain_runs`/`skill_chain_run_steps` already exist from `009-skill-chains`)
- At least two existing template-kind skills in the org (so a chain has something real to reference) — create them via the Prompts page if needed

## Setup

```bash
pnpm exec next dev -p 3001   # or `pnpm dev`; see CLAUDE.md for the -p flag gotcha
```

## Validate: viewing a chain's steps (User Story 1)

1. Author a chain version directly against the backend (no UI yet needed for this step — e.g. via a short script calling `publishVersion` with `steps`, or via `009-skill-chains`'s own test helpers) referencing two of your existing skills, the second depending on the first.
2. Open that skill's detail page (`/prompts/[name]`) — confirm a "Steps" tab and a "Run History" tab render instead of Template/Preview/Applied policies.
3. Confirm the Steps tab lists both steps in order, each showing its target skill name, pinned version (or "latest"), and the second step's "depends on" reference to the first.
4. Click the first step — confirm it navigates to that step's own referenced skill's detail page.
5. Author a second chain version with zero steps, set it active — confirm the Steps tab shows a clear "no steps defined" state, not a blank list.

## Validate: reviewing run history (User Story 2)

1. Using the backend's `startSkillChainRun`/`advanceSkillChainRun` (or existing test helpers) against the chain from Story 1, create one run that completes successfully and one where a step is reported as `"error"`.
2. Open the chain's Run History tab — confirm both runs appear, most-recent first, each with its overall status and start time.
3. Expand a step in the successful run — confirm the exact system/user message sent and the self-reported "success" outcome are shown.
4. Expand the failed run's steps — confirm the failed step shows its reported error message, and any step after it visibly shows "no real output available" rather than fabricated content.
5. Confirm the run history header/label indicates which chain version each run executed (relevant once you have 2+ published chain versions with runs against each).
6. Create enough runs to exceed one page (≥ `DEFAULT_CHAIN_RUN_PAGE_SIZE`, currently 20) — confirm the Run History tab shows a Prev/Next pager (matching `/settings/audit-log`'s pattern) rather than one unbounded list, and that navigating pages doesn't reset which tab (Steps vs. Run History) is active.
7. Confirm no button, link, or control anywhere in Run History starts, advances, or abandons a run.

## Validate: authoring a new chain version (User Story 3)

1. From any skill's detail page, open "New version" — confirm a Template/Chain toggle appears above the usual template fields.
2. Switch to Chain — confirm the template-only fields (system/user template, input schema) disappear and a step builder appears instead.
3. Add two steps, picking a real accessible skill for each; on the second step, mark it as depending on the first — confirm the first step is never offered as a dependency to itself, and the second step is never offered to the first (no same/later-position option).
4. Reorder the two steps, then remove one — confirm the remaining step's dependency selection updates accordingly (no longer showing the removed step as a dependency anywhere).
5. Publish with "set as active immediately" checked — confirm the new chain version becomes active and its Steps tab reflects exactly what was built.
6. Publish once more with the checkbox unchecked — confirm the previously-active version remains active (same behavior already proven for template versions).
7. Share the newly published chain version with another team, and assign it to a project — confirm both work identically to how they already work for a template-kind skill, with no separate controls.

## Validate: navigation (cross-cutting)

1. Confirm the app's sidebar has no "Workflows" (or similarly named) entry — chain-kind skills are only ever reached via the same Skills list/detail pages as template-kind skills.
2. Confirm a skill list containing both template-kind and chain-kind skills renders both in the same list with no separate grouping or route.
