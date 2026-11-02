---
epic: 015-distribution-correctness
feature: 009-user-scope-sync
status: open
dependencies: []
---

# User-Scope Sync

Ben, 2026-10-30: Tribe Bazaar's Claude plugin lets him reference any skill in any session with no per-project setup. SkillCanon can't, because the CLI keys everything off a repo: `init` needs a project URL, credentials live in `<repo>/.skillcanon/credentials.json`, stubs go to `<repo>/.claude/skills/skillcanon-<slug>/`, and the SessionStart hook goes into the repo's Claude settings. A skill exists for you only inside a repo you've initialised. A project is a governance scope (required skills, objectives, repo linking). It should be an optional overlay, not the entry fee.

## Requirements

- [ ] `skillcanon login --server <url> --api-key <key>` stores credentials once, in `~/.skillcanon/credentials.json` (mode 0600, the same redaction rules as today). `init` and `sync` read repo-local credentials first, then user-level, so existing setups keep working.
- [ ] `skillcanon sync --user` writes a stub for every skill the key's user can see, from every team they belong to, into `~/.claude/skills/skillcanon-<slug>/`. It uses the same reconcile and sync-manifest code as project sync; the manifest lives in `~/.skillcanon/`.
- [ ] `login` installs the SessionStart hook (`skillcanon sync --user --quiet`) in `~/.claude/settings.json`, merging with what's there, as `init` does for a repo today.
- [ ] A project-level sync adds that project's required skills and git context on top of the user-level set. A skill present at both levels is written once, at the project level, and the user-level stub for it is removed. No duplicate names in Claude's skill picker.
- [ ] `sync --user --quiet` on an unchanged catalog finishes in under a second, because it compares hashes and fetches nothing it already has. Measure it with 200 skills.
- [ ] `logout` removes the credentials, the user-level stubs and the hook.

## Acceptance Criteria

- [ ] On a machine with no repo initialised: `login`, open Claude Code in an empty directory, and a skill from the user's team is in the picker and runs through `skillcanon run`.
- [ ] Then `init` a repo with a project that requires a skill the user already had: the picker shows it once.
- [ ] `e2e/cli.e2e.test.ts` covers login → user sync → project init → logout.
- [ ] README's quickstart shows `login` as the first step and project `init` as optional.

## Technical Notes

- `cli/src/config/credentials.ts`, `cli/src/config/project-link.ts`, `cli/src/commands/{init,sync}.ts`, `cli/src/integrations/claude-settings.ts`. Most of the change is a second root path (`homedir()`) beside `repoRoot`; `update-check.ts` already uses `~/.skillcanon`.
- The server side already answers "which skills can this key see" for the MCP `sh-list`; reuse that query rather than adding a route.
- Out of scope: publishing the catalog as a Claude Code plugin marketplace (`skillcanon:<slug>` namespacing). That is the Tribe Bazaar integration's shape and gets its own feature once that conversation happens.
