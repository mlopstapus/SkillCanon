# Epic 013: Skill Import & External Registries

**Priority:** 13
**Status:** not-started
**Goal:** Make onboarding an existing project (or team) into SkillCanon fast by loading skills in bulk, from two different directions — pulling in publicly-published skills from outside the org, and pulling in skills a team already has sitting in their own repo.

## Overview

Both features become natural once a skill is a real file bundle (markdown + templates) rather than an opaque server-rendered string — see [PDR-018](../../docs/pdr/018-skill-file-format-and-registry-import.md), which this epic depends on for its target content shape. The two directions are genuinely separate workflows, not one feature with two modes:

- **External import** (feature 001): `npx skills add <source>` pulls skills *from* a public skill registry or a GitHub repo that publishes skills, creating them as new governed skills in SkillCanon's own registry. This is about bringing outside content in — no repo ownership required, since it's reading someone else's public skill, not touching your own.
- **Existing-repo upload** (feature 002): a separate scan/upload workflow for a repo *you own* — it reads your own `.claude/`/`.agents/` skill folders and registers whatever's already there into SkillCanon, so a team adopting SkillCanon on an existing, already-skill-equipped codebase doesn't have to hand-recreate every skill through the UI/API. Requires repo ownership/write access, since it's about consolidating your own existing content, not consuming someone else's.

## Features

- [ ] [001 - External Skill Registry Import](001-external-skill-registry-import.md)
- [ ] [002 - Existing Repo Skill Upload](002-existing-repo-skill-upload.md)

*Completed features are moved to `archive/` and checked off here.*

## Dependencies

- [PDR-018](../../docs/pdr/018-skill-file-format-and-registry-import.md)
- `backlog/006-prompt-registry/011-skill-file-format-refactor.md` (both features import/export skills in the new markdown-plus-templates shape, not the old flat-template one)
- `backlog/008-distribution/archive/005-skill-sync-cli.md` (both features are CLI-driven, extending the existing `skillcanon`/`skills` CLI surface)

## Notes

**Added 2026-08-05**, per user request alongside [PDR-018](../../docs/pdr/018-skill-file-format-and-registry-import.md)'s skill-format redesign. Both features are additive to the CLI and to `createPrompt`/`publishVersion` (no new bounded context needed — an imported/uploaded skill is a normal skill from Prompt Registry's point of view, just created via a new client-side ingestion path rather than the UI/direct API).

Neither feature is scheduled ahead of `006-prompt-registry/011-skill-file-format-refactor.md` and `008-distribution/007-skill-file-format-cli-support.md` — both need the new content shape to exist first, since importing/uploading a skill in the *old* flat-template shape would just recreate the problem this epic exists to move away from.
