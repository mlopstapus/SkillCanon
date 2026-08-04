# Quickstart: Skill Sync CLI

Validates the feature end-to-end against a running SkillCanon instance (self-hosted dev stack) and a scratch git repository.

## Prerequisites

- A running SkillCanon instance reachable at some `<origin>` (e.g. `pnpm dev` locally, or `docker compose up -d`), with at least one organization, project, and one published prompt visible to it.
- An API key for that org (create one via the existing API Keys UI/route — out of this feature's scope to generate).
- The project's own detail page URL, `<origin>/projects/<project-id>` — this is the "project key" (research.md D1).
- The `cli/` package built and linked (`pnpm --dir cli build && pnpm --dir cli link --global`, or run via `node cli/dist/index.js` directly) so `skillcanon` resolves on `PATH`.
- A scratch git repository to act as the "connected repo" (`mkdir /tmp/skillcanon-quickstart && cd $_ && git init`).

## Scenario 1 — Setup and zero-touch sync (User Story 1)

1. `skillcanon init --project-key "<origin>/projects/<project-id>"`, paste the API key when prompted.
2. Confirm: `.skillcanon/project.json` exists and is not git-ignored (`git check-ignore .skillcanon/project.json` exits 1); `.skillcanon/credentials.json` exists, is git-ignored (`git check-ignore .skillcanon/credentials.json` exits 0), and is not world-readable (`stat -f '%Lp' .skillcanon/credentials.json` → `600`).
3. Confirm: `.claude/skills/skillcanon-<slug>/SKILL.md` exists for every prompt visible to that project, with `name`/`description` frontmatter matching the prompt's current metadata.
4. Confirm: `CLAUDE.md` and `AGENTS.md` each contain the SkillCanon blurb.
5. Add a new prompt to the project via the SkillCanon web UI. Run `skillcanon sync`. Confirm a new stub appears for it with no other manual step (SC-002).
6. Rename or delete that prompt via the web UI. Run `skillcanon sync` again. Confirm the corresponding stub is renamed/removed accordingly (SC-004).

## Scenario 2 — Manual run and live governance (User Story 2)

1. `skillcanon run <slug>` for any synced prompt. Confirm the printed stdout matches what the web UI's own prompt preview currently resolves to.
2. Attach or change a policy/objective on that prompt via the web UI. Immediately re-run `skillcanon run <slug>`. Confirm the printed output reflects the change with no delay (SC-003) — no restart, no re-sync needed.

## Scenario 3 — Conflict and failure safety (User Story 3)

1. Hand-edit the body of a synced stub file (`.claude/skills/skillcanon-<slug>/SKILL.md`). Run `skillcanon sync`. Confirm the file is unchanged afterward and a conflict warning printed to stderr naming that stub (SC-006); confirm every *other* stub still updated normally in the same run (FR-010a).
2. Temporarily invalidate the stored API key (edit `.skillcanon/credentials.json`'s `apiKey` to a bogus value). Run `skillcanon run <slug>`. Confirm a non-zero exit and a clear stderr error, no stdout output.
3. Run `skillcanon run does-not-exist`. Confirm a non-zero exit and a clear "prompt not found" style error.
4. Disconnect network access (or point `.skillcanon/project.json`'s `server` at an unreachable host). Run `skillcanon run <slug>`. Confirm a non-zero exit with a network-error message, returned promptly (not hung).
5. Restore the correct API key and server. Simulate a session start by invoking whatever command the installed `.claude/settings.json` `SessionStart` hook runs, with the server still unreachable. Confirm the command itself does not exit non-zero in a way that would block a real Claude Code session start (FR-013), and prints a warning.

## Expected end state

All three user stories' acceptance scenarios (`spec.md`) pass manually; `pnpm --dir cli test` (or the package's own test script) passes; no API key value appears in any terminal output captured across the above steps.
