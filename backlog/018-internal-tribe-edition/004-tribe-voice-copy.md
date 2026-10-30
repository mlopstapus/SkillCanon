---
epic: 018-internal-tribe-edition
feature: 004-tribe-voice-copy
status: open
dependencies: [001-remove-marketing-site, 002-one-tribe-organization]
---

# Copy in the Tribe Voice

Rewrite the UI's words for Tribe's builders, using `voice/GUIDE.md` from the `tribe-bazaar:tribe-design` skill (website register).

## Requirements

- [ ] **Auth screens.** The brand rail (`src/app/(auth)/_components/brand-rail.tsx`), login, setup, welcome and invite say what the tool is for at Tribe, in a sentence or two. The pitch goes: no "prompt control plane", no feature bullets, no "self-hosted" or "tenant-aware" selling points.
- [ ] **Root metadata.** The `title` and `description` in `src/app/layout.tsx` describe the internal tool. Drop "Self-hosted prompt registry distributed via MCP".
- [ ] **Claims.** Remove marketing claims the UI can't back up: "SOC2-aligned" and compliance CTAs.
- [ ] **Vocabulary.** Empty states, page intros and buttons follow the voice guide:
  - say "builders", "ship" and "production";
  - never "seamless", "empower", "cutting-edge" or "world-class";
  - no hype and no hedging;
  - name the product once, per decision D6.
- [ ] **README.** The opening says this is Tribe's internal skills registry and how a builder gets access (ask an admin for an invitation). The self-host quickstart stays, because it is still how the instance runs.

## Acceptance Criteria

- [ ] `grep -riE "seamless|empower|cutting-edge|world-class|best-in-class|SOC ?2" src README.md` returns nothing that a user sees.
- [ ] Copy changes in unit tests and `e2e/ui-walk.e2e.test.ts` are updated in the same PR.

## Technical Notes

- Copy only. Don't change layout or styling here; 003 owns that.
- `docs/` keeps its SaaS-era PDRs and context files. They are history.
