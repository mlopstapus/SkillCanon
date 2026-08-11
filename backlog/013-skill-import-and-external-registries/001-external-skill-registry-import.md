---
epic: 013-skill-import-and-external-registries
feature: 001-external-skill-registry-import
status: open
dependencies: ["backlog/006-prompt-registry/011-skill-file-format-refactor.md", "backlog/008-distribution/007-skill-file-format-cli-support.md"]
---

# External Skill Registry Import

`npx skills add <source>` — pulls one or more skills from an external source (a public skill registry, or a GitHub repo publishing Claude Code-style skills) and creates them as new governed skills in SkillCanon's own registry, under the caller's own project/org. No repo-ownership requirement — this reads a publicly-published skill, it doesn't touch anything the caller owns.

**Status note (036-external-skill-import, 2026-08-10):** The backend fetch/parse/create pipeline and the web UI's New Skill drawer "Import from link" mode are built and verified end-to-end against a real public repo (`anthropics/skills`, 16 real skills discovered and one imported live). The **CLI-side `npx skills add` command itself does not exist** — `cli/` (the real installed package, bin name `skillcanon`, not `skills`) has no `add` command; the web UI's CLI hint text (`npx skills add <source>`) is aspirational, copied from the source design mockup, and doesn't correspond to a runnable command today. Building `cli/src/commands/add.ts` (calling the same `POST`-equivalent flow, likely a new REST route since the web UI currently calls this through a Next.js server action, not `src/app/api/**`) is the remaining scope of this item — see the per-requirement checkboxes below. Leaving `status: open` since the item's own title requirement (a CLI command) isn't done yet, per this repo's established convention of only checking off what's actually true.

## Requirements

- [ ] `npx skills add <source>` **(CLI command)**: accepts a GitHub repo URL (or `owner/repo` shorthand) and/or a named external skill-registry identifier; fetches the skill(s) found there. Not built — no `cli/src/commands/add.ts` exists, and there's no REST route (`src/app/api/**`) exposing the import flow for a CLI/API-key caller to hit; only a web-UI server action does today (`src/app/(app)/prompts/actions.ts`'s `fetchExternalSkillSourceAction`/`importExternalSkillsAction`, session-cookie-authenticated only).
- [x] Source-format parsing: read a real Claude Code skill folder shape (`SKILL.md` frontmatter + body + any reference/template files in the same folder) from the fetched source — this is the same shape `006-prompt-registry/011-skill-file-format-refactor.md` adopts for SkillCanon's own skills, so import is a straight mapping, not a transform. Built: `src/bcs/prompt-registry/{domain/external-skill-source.ts,infrastructure/github-skill-source.ts,application/fetch-external-skill-source.ts}`.
- [x] Multi-skill sources: a GitHub repo or registry entry may publish more than one skill (e.g. a `skills/` directory with several subfolders) — detect and let the caller pick which to import, or import all with a flag. Built: three detection layouts (root `SKILL.md`; a `skills/` directory; top-level subdirectories each containing their own `SKILL.md`), caller selects per-skill checkboxes in the web UI (no CLI `--all` flag, since no CLI command exists yet).
- [x] Each imported skill is created via the existing `createPrompt`/`publishVersion` API, owned by the invoking user (matching `createPrompt`'s existing "always creates a user-owned skill" behavior, `bcs/prompt-registry/CONTRACT.md`) — no special-cased ownership path for imported skills. Built.
- [x] Provenance: record where an imported skill came from (source URL/registry identifier) somewhere durable enough to show in the UI later. Built: nullable `prompts.source_url` column (migration `0030`), shown on the skill detail page ("imported from `<source>`").
- [x] Name collision handling: importing a skill whose name already exists in the target org is rejected with a clear error (matching `createPrompt`'s existing duplicate-name behavior) — no silent overwrite. Built: client-side pre-check (disables Import) plus `createPrompt`'s existing `DuplicatePromptNameError` as the authoritative server-side backstop.

## Acceptance Criteria

- [ ] `npx skills add <github-repo-url>` against a repo with one real `SKILL.md`-shaped skill produces a new, correctly-owned skill in SkillCanon with matching markdown content and template files — **the underlying capability is proven** (verified live via the web UI against `anthropics/skills`), but not via the CLI command this criterion names, since it doesn't exist yet.
- [x] A source repo with multiple skills either prompts the caller to select which to import, or imports all under an explicit `--all` flag — never silently imports only one with no indication others existed. Satisfied via the web UI's per-skill checkbox selection.
- [x] Importing a skill whose name collides with an existing one in the target org fails with a clear, actionable error, not a silent overwrite or a duplicate under a mangled name.
- [x] An imported skill's provenance (source) is queryable/visible somewhere in the product, not discarded after import.

## Open Questions

- ~~Is there a real, existing "public skill registry" this should integrate with day one, or is GitHub-repo-only sufficient for v1 with a registry protocol added later?~~ **Resolved:** GitHub-only for v1 — no other named public skill registry exists anywhere in this codebase's docs to integrate with.
- ~~Exact provenance storage shape~~ **Resolved:** a single nullable `source_url` column on `prompts` — one durable record per imported skill, not a full history of every import/fetch attempt.
- ~~Should a re-run of `npx skills add` against an already-imported source update the existing skill (new version) or always create a fresh one?~~ **Resolved:** no special handling — a re-run hits the same name-collision rejection as any other duplicate name. No update/re-sync story was built.

## Dependencies

- `backlog/006-prompt-registry/011-skill-file-format-refactor.md`
- `backlog/008-distribution/007-skill-file-format-cli-support.md`
- [PDR-018](../../docs/pdr/018-skill-file-format-and-registry-import.md)

## Technical Notes

This is the CLI reading *someone else's* skill content and pushing it *into* SkillCanon via the normal create/publish API — the inverse direction of `sync`'s existing pull-from-SkillCanon behavior, and a different direction again from `002-existing-repo-skill-upload.md`'s "read your own repo, push up" flow (that one requires repo ownership; this one explicitly doesn't, since it's reading public content). Keep the two features' CLI commands and code paths distinct rather than merging them into one "flexible" command — they have different auth/ownership assumptions and are conceptually different actions for the user.
