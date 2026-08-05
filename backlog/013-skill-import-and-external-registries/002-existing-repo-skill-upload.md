---
epic: 013-skill-import-and-external-registries
feature: 002-existing-repo-skill-upload
status: open
dependencies: ["backlog/006-prompt-registry/011-skill-file-format-refactor.md", "backlog/008-distribution/007-skill-file-format-cli-support.md"]
---

# Existing Repo Skill Upload

A separate CLI workflow (distinct command from `001-external-skill-registry-import.md`'s `npx skills add`) for onboarding SkillCanon into a repo you already own: scan the repo's own `.claude/skills/` and/or `.agents/skills/` folders for skills already sitting there, and register them into SkillCanon in bulk, so a team adopting SkillCanon on an existing, already-skill-equipped codebase doesn't have to hand-recreate every skill through the UI or API. Requires the caller to actually own/administer the target project — this is pushing your own content up, not pulling in someone else's.

## Requirements

- [ ] A CLI command (e.g. `skillcanon skills upload` or similar — exact name TBD, distinct from `npx skills add`) that scans the current repo's `.claude/skills/*/` and `.agents/skills/*/` directories for real skill folders (`SKILL.md` + optional reference/template files)
- [ ] Requires an authenticated, linked SkillCanon project (same `.skillcanon/project.json` + credential mechanism `archive/005-skill-sync-cli.md` already established via `skillcanon init`) — this is not a public/anonymous operation
- [ ] Presents the detected skill set to the caller before uploading anything (dry-run/preview by default) — no silent bulk-create
- [ ] Each uploaded skill is created via the existing `createPrompt`/`publishVersion` API, owned by the invoking user, same as `001-external-skill-registry-import.md`'s creation path — no special-cased ownership model
- [ ] Name collision handling identical to `001`'s: a skill whose name already exists in the target org fails clearly, no silent overwrite
- [ ] After upload, the repo's local skills and the SkillCanon-registered skills are two independent copies (this is a one-time bulk-create, not an ongoing sync) — running `skillcanon sync` afterward will pull the newly-registered skills back down like any other skill, which may produce a visible diff against the original local files if the format refactor (`006-prompt-registry/011-skill-file-format-refactor.md`) changed anything in translation; document this clearly rather than surprising the user

## Acceptance Criteria

- [ ] Running the upload command against a repo with three real local skills previews all three, and on confirmation creates exactly three correctly-owned, correctly-content-matching skills in SkillCanon
- [ ] Running it against a repo with zero skill folders reports that clearly, does nothing destructive
- [ ] A collision with an existing SkillCanon skill name fails that one skill's upload with a clear error, without aborting or silently skipping the rest of the batch
- [ ] The command refuses to run without a linked, authenticated project (same guard `skillcanon sync`/`run` already enforce)

## Open Questions

- Exact scope of "own" the repo — is SkillCanon project-membership/role sufficient authorization, or does this need a stronger check? Likely reuses whatever authorization `createPrompt`/project-membership already enforces, but confirm during planning rather than assuming.
- Should this also detect and flag skills that look like duplicates of ones already imported via `001-external-skill-registry-import.md` (matching provenance/content), to avoid double-registering the same skill from both directions? Nice-to-have, not required for v1.

## Dependencies

- `backlog/006-prompt-registry/011-skill-file-format-refactor.md`
- `backlog/008-distribution/007-skill-file-format-cli-support.md`
- `backlog/008-distribution/archive/005-skill-sync-cli.md` (reuses its auth/credential mechanism)
- [PDR-018](../../docs/pdr/018-skill-file-format-and-registry-import.md)

## Technical Notes

Keep this genuinely separate from `001-external-skill-registry-import.md` — different auth/ownership assumptions (this one requires being an authenticated member of the target SkillCanon project; that one doesn't), different source (your own repo's local filesystem vs. an external URL), and different intent (consolidating what you already have vs. bringing in outside content). A single "flexible add" command that blurs these two would make the ownership/authorization story harder to reason about for both users and reviewers.
