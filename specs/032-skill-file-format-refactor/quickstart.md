# Quickstart: Validating the Skill File Format Refactor

## Prerequisites

- Local stack running: `docker compose up -d` (or `pnpm dev` against a running Postgres).
- Migrations applied: `pnpm db:migrate` (creates `prompt_registry.prompt_version_files` and drops `input_schema`).
- An authenticated org/user (existing seed data or a fresh signup flow).

## Scenario 1 — Publish a new-shape version and expand it (User Stories 1 & 2)

1. Create a skill: `POST /api/skills` (or the "New skill" drawer) with `{ name: "release-notes", description: "..." }`.
2. Publish v1 with a file bundle: `POST /api/skills/release-notes/versions`:
   ```json
   { "version": "1", "mainFile": { "content": "# Release notes\nSummarize the diff below." }, "supportingFiles": [{ "name": "example.md", "content": "..." }] }
   ```
   Expect `201` with a version whose `files` array has 2 entries (`SKILL.md` marked `isMain: true`, `example.md` not).
3. Expand it: `POST /api/skills/release-notes/expand` with `{}` (no `input` field).
   Expect `200` with `{ content: "# Release notes\nSummarize the diff below.", appliedPolicies: [...], objectives: [...] }`.

## Scenario 2 — Reject invalid file bundles (User Story 1 edge cases)

- Publish with two `supportingFiles` sharing a name → expect `422 INVALID_SKILL_VERSION_FILES`.
- Publish with `mainFile.content` exceeding 64 KB → expect `422 INVALID_SKILL_VERSION_FILES`.
- Publish with `mainFile.content: ""` → expect `422 INVALID_SKILL_VERSION_FILES`.

## Scenario 3 — Legacy version keeps resolving (User Story 4)

1. Against a pre-existing organization/skill with a version published before this feature (`system_template`/`user_template` set, no `prompt_version_files` rows), call `POST /api/skills/<name>/expand`.
   Expect `200` with `content` equal to the old `systemMessage`/`userMessage` composed as `${systemMessage}\n\n${userMessage}` (or just `userMessage` if `systemMessage` was null).
2. Open that skill in the app (`/prompts/<name>`). Expect: no Files tab; Overview shows the original system/user template content inline with a "predates file-based skills" note.

## Scenario 4 — `include_prompt` across mixed shapes (User Story 2, FR-008)

1. Publish skill A (new-shape) with main file content `Intro.\n{{ include_prompt('legacy-skill') }}\nOutro.`, where `legacy-skill` is a pre-existing legacy-shape skill.
2. Expand skill A. Expect the legacy skill's composed system+user content to appear inline between "Intro." and "Outro.", exactly as it does today when both sides are legacy-shape.

## Scenario 5 — App UI walkthrough (User Story 3)

1. Open a new-shape skill's detail page. Confirm Overview shows file count / active version / policy count / owner cards.
2. Open the Files tab. Confirm `SKILL.md` is listed and marked required; toggle Preview ↔ Plain text on it.
3. Add a new supporting file via the Files tab; confirm it appears and is editable.
4. Confirm there is no control to remove the main file.
5. Open "New version" on this skill; confirm the drawer shows a file-bundle editor (no System/User template textareas) for the Template kind, and the Chain kind tab is unaffected.
6. Open "New skill"; confirm the drawer collects only name/description/tags (no template fields), and completing it leads into the same file-bundle publish flow for v1.

## Automated verification

- `pnpm typecheck` — full signature propagation check across `expand()`/`publishVersion()` callers (REST routes, MCP tools, existing tests) per the repo's own established practice of using `tsc` as a real-callsite-audit tool for shared-function signature changes.
- `pnpm vitest run src/bcs/prompt-registry` — unit/application tests for the new file-bundle model, expansion composition, and legacy-compat paths.
- `pnpm vitest run src/bcs/distribution` — MCP `sh-run` / REST expand route tests.
- Full suite before `/as-finish`: `pnpm exec vitest run --fileParallelism=false --testTimeout=30000` (never bare `pnpm test` — see project conventions on Docker daemon exhaustion).
