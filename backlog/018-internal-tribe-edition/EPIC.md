# Epic 018: Internal Tribe Edition

**Priority:** 5
**Status:** not-started
**Goal:** SkillCanon looks and reads like a Tribe internal tool: Tribe's visual identity, one Tribe organization, and no SaaS landing page, sign-up funnel or marketing claims.

## Overview

The product is aimed at Tribe's own builders, not at outside customers. Ben deferred billing (epic 009) on 2026-10-30 for the same reason. The UI still presents a SaaS product:

- `/` is a ten-section marketing page (`src/app/_components/marketing/`) with a hero, trust strip, compliance CTA, Open Graph image and Twitter card.
- `/register` lets anyone create a new organization with its own slug.
- The auth brand rail sells a "prompt control plane".
- The type and colour are SkillCanon's own: Bricolage Grotesque, Hanken Grotesk and Spline Sans Mono.

This epic replaces all of that with Tribe's brand and an internal framing. Tribe's brand rules come from the `tribe-bazaar:tribe-design` skill: start with `brand/GUIDE.md` for visuals and `voice/GUIDE.md` for copy.

What does not change:
- the data model, including multi-tenancy and RLS. The entry point to a second organization closes; the tables stay.
- REST, MCP and CLI behaviour.
- the product name, unless decision D6 says otherwise.

## Features

- [x] [001 - Remove the Marketing Site](archive/001-remove-marketing-site.md)
- [x] [002 - One Tribe Organization](archive/002-one-tribe-organization.md)
- [ ] [003 - Tribe Visual Identity](003-tribe-visual-identity.md)
- [ ] [004 - Copy in the Tribe Voice](004-tribe-voice-copy.md)

_Completed features are moved to `archive/` and checked off here._

## Dependencies

- None in the backlog. 003's fonts and logos wait on decision D5.
- Open pull requests #111–#119 edit `README.md` and add VCS pages. Rebase after they merge. The new pages pick up the theme because they use the shared tokens.

## Open decisions

- **D5: the repository is public, and Tribe's fonts are licensed.** TribeSerif, TribeSans and TribeCaption shouldn't be redistributed in a public repository, and the logos are Tribe trademarks. The options:
  - (a) Make `mlopstapus/SkillCanon` private, then commit the fonts and logos. This is the simplest option and matches "internal". Private repositories on a personal account get a limited allowance of Actions minutes.
  - (b) Keep the repository public. Commit the colour tokens, and load fonts and logos at deploy time from a private source, falling back to system fonts.
  - (c) Transfer the repository to the TribeAI org as a private repository. Ben chose to keep it under `mlopstapus` for now (2026-10-30), so this is (a) with a later move.
- **D6: name.** Keep "SkillCanon", shown as a Tribe tool ("SkillCanon · Tribe"), or rename it.
- **D7: sign-in.** Keep email and password, invite-only, for this epic. Tribe SSO and an `apps.tribe.ai` hostname belong to Tribe's internal-apps standard (`tribe-bazaar:building-internal-apps`) and would be a later epic.

## Notes

- 002-end-to-end-smoke-test's walk (`e2e/ui-walk.e2e.test.ts`) asserts the landing page, its theme toggle and `/register`. Each feature here updates those assertions, so the walk stays the regression check.
