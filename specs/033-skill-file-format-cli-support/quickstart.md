# Quickstart: Validating Skill File Format CLI Support

## Prerequisites

- Local stack running (`docker compose up -d` or `pnpm dev`), with at least one org/user and API key.
- CLI package built (`pnpm --dir cli run build` or run via `tsx`/`node` per `cli/package.json`'s dev script).
- A repo linked via `skillcanon init` (or a scratch dir with `.skillcanon/project.json`/`credentials.json` hand-seeded, matching existing CLI test fixtures).

## Scenario 1 — New-shape skill syncs real content (User Story 1)

1. Publish a skill with a main file and one supporting file (via the app or `POST /api/skills/[name]/versions`).
2. Run `skillcanon sync` in the linked repo.
3. Confirm `.claude/skills/skillcanon-<slug>/SKILL.md` matches the main file's content exactly, and `.claude/skills/skillcanon-<slug>/<supporting-file-name>` exists with matching content.
4. Publish a new version with different main-file content; re-run `sync`; confirm `SKILL.md` updates to the new content.

## Scenario 2 — Hand-edit protection, per file (User Story 2)

1. From Scenario 1's synced skill, hand-edit the supporting file's content.
2. Publish a new version changing only the main file (not the supporting file's content).
3. Run `sync`. Expect: `SKILL.md` updates to the new main-file content; the supporting file is left untouched and reported as skipped (hand-edited).
4. Run `sync --force`. Expect: the supporting file is now overwritten to match the server.

## Scenario 3 — No-content skills keep the pointer stub (User Story 3)

1. Ensure the roster includes one chain-kind skill and one skill whose active version predates `032-skill-file-format-refactor` (legacy-shape).
2. Run `sync`. Expect: both get the unchanged one-line pointer stub as `SKILL.md`, no supporting files, no errors — and any new-shape skill in the same roster still gets real content in the same run.

## Scenario 4 — Orphaned file removal

1. From Scenario 1's synced skill (main file + one supporting file), publish a new version with only a main file (the supporting file dropped).
2. Run `sync`. Expect: the previously-synced supporting file is deleted from the local folder; `SKILL.md` still updates normally.

## Automated verification

- `pnpm --dir cli run typecheck`
- `pnpm --dir cli test` — fast, mocked-HTTP-server + temp-dir based, no Testcontainers/Docker (existing convention, unchanged)
- Manually confirm `CLAUDE.md`/`AGENTS.md`'s SkillCanon blurb (inserted by `skillcanon init`) describes the new sync behavior, not the old pointer framing.
