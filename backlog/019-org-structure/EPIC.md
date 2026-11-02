# Epic 019: Org Structure From HR Systems

**Priority:** 6
**Status:** not-started
**Goal:** An instance's teams mirror the company's real org structure — functional teams, owned by their managers, with reporting lines recorded on people — built from an HR export in one idempotent run, so governance attaches to the units a company actually manages by.

## Overview

On 2026-11-02 Ben seeded his instance from Tribe's Rippling org chart (152 people, 28 managers) with a throwaway script. It worked, and it exposed how SkillCanon's model fights an org chart:

- A person belongs to exactly one team and a team has one owner. There is **no manager relation on a person**, so the only way to keep "who reports to whom" was to make every manager a team named after them. Teams named after people are not how anyone draws an org chart, and a manager sitting inside their own team double-counts.
- A manager with reports but no team of their own cannot be represented at all.
- Someone who belongs to two groups (a design lead who also sits on an engagement) can only be in one. Projects cover engagement membership; teams don't.

The mapping Ben confirmed (roles, not names; the real roster never enters this repository):

```
Tribe
├─ Executive                        the CEO, the President, their EA
├─ Talent  (owner: Head of Talent)  plus the admin and the talent-ops lead
│  ├─ Recruiting  (Recruiting Lead) seven recruiters
│  └─ People Ops  (People Ops Lead) one consultant
├─ Forward Deployed  (FD CTO)
│  └─ <squad per architect> …       named after the engagement it serves, from the staffing system
├─ Engineering & Product  (CTO)
├─ GTM  (Head of GTM) → Delivery Ops, Solutions Architecture, GM groups
└─ Partnerships  (Head of Partnerships)
```

Functional names; the manager **owns the team and is a member of it**; reporting lines live on the person, not in the team name. Teams are governance scopes, so they should be the units a policy would attach to.

## Features

- [ ] [001 - Roster Import](001-roster-import.md)
- [ ] [002 - Reports-To on a Person](002-reports-to.md)

_Completed features are moved to `archive/` and checked off here._

## Dependencies

- 002 adds one migration; coordinate the number with the other open lanes.
- The real roster is personal data and the repository is public. It never enters the repo: the import reads a file outside the tree (`.local/` is git-ignored), and tests use a fictional fixture.

## Open questions

- ~~**Secondary membership.**~~ Decided 2026-11-02 after the first real import: a person has one team, and **engagements are projects** (one per client, under the squad that serves it, members = the people staffed on it). Nothing finer than the engagement is modelled: no pods, no workstreams as teams or projects. Where staffing comes from (the staffing system's accounts) is a later feature if the mapping proves worth automating.
- **Where the functional names come from.** Rippling has titles and managers, not team names. 001 uses a hand-maintained mapping file plus SCC's engagement assignments for delivery squads. If that mapping is painful to keep, the alternative is a `team` column in the roster that HR owns.
