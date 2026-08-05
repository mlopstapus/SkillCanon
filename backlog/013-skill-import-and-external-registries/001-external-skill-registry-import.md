---
epic: 013-skill-import-and-external-registries
feature: 001-external-skill-registry-import
status: open
dependencies: ["backlog/006-prompt-registry/011-skill-file-format-refactor.md", "backlog/008-distribution/007-skill-file-format-cli-support.md"]
---

# External Skill Registry Import

`npx skills add <source>` — pulls one or more skills from an external source (a public skill registry, or a GitHub repo publishing Claude Code-style skills) and creates them as new governed skills in SkillCanon's own registry, under the caller's own project/org. No repo-ownership requirement — this reads a publicly-published skill, it doesn't touch anything the caller owns.

## Requirements

- [ ] `npx skills add <source>`: accepts a GitHub repo URL (or `owner/repo` shorthand) and/or a named external skill-registry identifier; fetches the skill(s) found there
- [ ] Source-format parsing: read a real Claude Code skill folder shape (`SKILL.md` frontmatter + body + any reference/template files in the same folder) from the fetched source — this is the same shape `006-prompt-registry/011-skill-file-format-refactor.md` adopts for SkillCanon's own skills, so import is a straight mapping, not a transform
- [ ] Multi-skill sources: a GitHub repo or registry entry may publish more than one skill (e.g. a `skills/` directory with several subfolders) — detect and let the caller pick which to import, or import all with a flag
- [ ] Each imported skill is created via the existing `createPrompt`/`publishVersion` API, owned by the invoking user (matching `createPrompt`'s existing "always creates a user-owned skill" behavior, `bcs/prompt-registry/CONTRACT.md`) — no special-cased ownership path for imported skills
- [ ] Provenance: record where an imported skill came from (source URL/registry identifier) somewhere durable enough to show in the UI later (exact field/table TBD during planning — likely a nullable column on `prompts`, not a new bounded concept)
- [ ] Name collision handling: importing a skill whose name already exists in the target org is rejected with a clear error (matching `createPrompt`'s existing duplicate-name behavior) — no silent overwrite

## Acceptance Criteria

- [ ] `npx skills add <github-repo-url>` against a repo with one real `SKILL.md`-shaped skill produces a new, correctly-owned skill in SkillCanon with matching markdown content and template files
- [ ] A source repo with multiple skills either prompts the caller to select which to import, or imports all under an explicit `--all` flag — never silently imports only one with no indication others existed
- [ ] Importing a skill whose name collides with an existing one in the target org fails with a clear, actionable error, not a silent overwrite or a duplicate under a mangled name
- [ ] An imported skill's provenance (source) is queryable/visible somewhere in the product, not discarded after import

## Open Questions

- Is there a real, existing "public skill registry" this should integrate with day one, or is GitHub-repo-only sufficient for v1 with a registry protocol added later? Affects whether this feature needs a second source-fetching adapter beyond GitHub, or just GitHub for now.
- Exact provenance storage shape (new column vs. a small new table if multiple import events per skill need tracking over time, e.g. re-import/update).
- Should a re-run of `npx skills add` against an already-imported source update the existing skill (new version) or always create a fresh one? Affects whether this feature needs its own drift-detection story, similar to `sync-manifest.ts`'s pattern for the down-sync direction.

## Dependencies

- `backlog/006-prompt-registry/011-skill-file-format-refactor.md`
- `backlog/008-distribution/007-skill-file-format-cli-support.md`
- [PDR-018](../../docs/pdr/018-skill-file-format-and-registry-import.md)

## Technical Notes

This is the CLI reading *someone else's* skill content and pushing it *into* SkillCanon via the normal create/publish API — the inverse direction of `sync`'s existing pull-from-SkillCanon behavior, and a different direction again from `002-existing-repo-skill-upload.md`'s "read your own repo, push up" flow (that one requires repo ownership; this one explicitly doesn't, since it's reading public content). Keep the two features' CLI commands and code paths distinct rather than merging them into one "flexible" command — they have different auth/ownership assumptions and are conceptually different actions for the user.
