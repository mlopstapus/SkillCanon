# Epic 016: Skill Feedback

**Priority:** 3
**Status:** in-progress
**Goal:** Anyone using a skill can tell its owner, against the exact version and text they were given, that it worked, failed or needs a change, and the owner sees that feedback where they edit the skill.

## Overview

The design follows a skills library built elsewhere (ideas only, no code): every serve gets an id, and feedback attaches to a verified serve id rather than to a skill name. That makes feedback answerable ("which text was this about?") and keeps it honest when the skill has moved on to a newer version.

SkillCanon already writes a `distribution.prompt_usage` row per run, so most of the anchor already exists. Note the existing invariant that `expand()` itself must never call `recordPromptUsage`: the serve id comes from the distribution layer that records usage, not from `expand()`.

## Features

- [x] [001 - Serve Id and Content Digest](archive/001-serve-id-and-digest.md)
- [x] [002 - Feedback Intake](archive/002-feedback-intake.md)
- [x] [003 - Feedback in the Skill Page](archive/003-feedback-in-skill-page.md)
- [ ] [004 - Drafted Improvements](004-drafted-improvements.md) (built and verified with a stub model, #112; the drafter moving onto the eval pool is open as #123; live provider check needs Ben)

_Completed features are moved to `archive/` and checked off here._

## Dependencies

- `backlog/015-distribution-correctness/` 001 (what the consumer actually received has to be settled first)
