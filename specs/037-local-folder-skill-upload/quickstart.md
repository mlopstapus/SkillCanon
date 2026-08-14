# Quickstart: Local Folder Skill Upload

## Prerequisites

- Local dev stack running: `docker compose up -d` (or `pnpm dev` against an already-migrated database — see root `CLAUDE.md`).
- A signed-in session on the app (e.g. the shared dev stack's seeded `alice@example.com` account).
- A local test folder with a few real skill folders to select, e.g.:
  ```text
  test-skills/
  ├── .claude/skills/
  │   └── release-notes/
  │       └── SKILL.md
  └── standalone-skill/
      ├── SKILL.md
      └── reference.md
  ```

## Automated checks

```bash
pnpm vitest run src/bcs/prompt-registry/domain/local-skill-source.test.ts
pnpm vitest run src/app/\(app\)/prompts/new-prompt-drawer.test.tsx
pnpm typecheck
pnpm lint
```

(Full-suite `pnpm test` is not required for this change alone per this repo's own guidance — use `pnpm exec vitest run --fileParallelism=false --testTimeout=30000` only as part of `/as-finish`'s final gate.)

## Manual validation (browser)

1. Navigate to `/prompts`, open the "New skill" drawer.
2. Confirm a third mode tab, "Import from folder" (or similar), sits alongside "Blank skill" / "Import from link".
3. Select `test-skills/` via the folder picker (or drag it onto the drop zone).
4. Confirm the preview shows exactly 2 detected skills (`release-notes`, `standalone-skill`), each showing its file bundle (`SKILL.md` + `reference.md` for the second).
5. Confirm nothing is created yet — no navigation, no new row in the skills list.
6. Uncheck one candidate, confirm the batch — confirm only the still-checked skill is created, owned by the signed-in user, with matching content on its detail page.
7. Repeat step 3 with a folder containing two directories that both resolve to the same skill name (e.g. copy `standalone-skill/` to `standalone-skill-2/` but leave its `SKILL.md` `name:` frontmatter identical) — confirm both are shown flagged as conflicting and at most one can be selected at a time.
8. Repeat step 3 with a folder whose only skill name collides with an already-registered org skill — confirm on confirm, that one skill fails with a clear error while any other selected skills in the same batch still succeed.
9. Repeat step 3 with an empty/unrelated folder (no `SKILL.md` anywhere) — confirm a clear "no skills found" message, nothing created.
10. Sign out and confirm the feature is unreachable (drawer/action requires auth) before anything is scanned or uploaded.
11. **(2026-08-13 perf fix)** On Chrome/Edge, click "Choose folder" and select this repo's own root folder (not a small test fixture). Confirm the OS's native File System Access picker appears (not the plain `<input>` file dialog), that a "Reading folder…" message shows immediately, and that any skills under `.claude/`/`.agents/` are found within a few seconds — it should not hang on `node_modules`/`.next`/`.git`. Repeat via drag-and-drop of the repo root folder onto the drop zone and confirm the same speed. If Firefox or Safari is available, repeat step 3's flow there and confirm the fallback `<input webkitdirectory>` picker still works (slower on a huge root, since that path can't avoid the browser's native full enumeration, but still doesn't hang indefinitely and still finds the same skills).

See `contracts/server-actions.md` for the exact Server Action shapes exercised by steps 3-9, and `data-model.md` for the in-memory candidate/scan-result shapes the preview UI renders.
