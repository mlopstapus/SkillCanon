# RCA: External skill import finds 0 skills for `mlopstapus/anchorstack-skills`

**Date:** 2026-08-13
**Status:** Root cause identified (confirmed)

## What broke

Pointing the New Skill drawer's "Import from link" mode (and the equivalent
`fetchExternalSkillSourceAction` server action it calls) at
`mlopstapus/anchorstack-skills` returns no skills — the fetch fails with
`ExternalSourceNotFoundError` ("No skill content found at
'mlopstapus/anchorstack-skills'. Expected a SKILL.md file at the repository
root, under a 'skills/' directory, or in a top-level subdirectory."), even
though the repo genuinely publishes 18+ real skills. The `npx skills add
<source>` text shown in that same drawer is inert UI copy, not a runnable
command (the installed CLI's real bin is `skillcanon`, with only
`init`/`sync`/`run` subcommands, no `add`) — confirmed unchanged from the
existing session-memory note — so it isn't itself the cause of anything,
just a red herring the user understandably tried to run.

## Causation chain

```
Symptom: fetchExternalSkillSource("mlopstapus/anchorstack-skills") throws
ExternalSourceNotFoundError, 0 candidates found
  ↓ caused by
fetch-external-skill-source.ts:79-121 scans exactly 3 shapes, at most one
level below the given path: (1) SKILL.md directly at the given path,
(2) a directory literally named "skills" as an immediate child of the given
path, (3) failing both, every immediate child directory of the given path
that itself directly contains a SKILL.md
  ↓ caused by
mlopstapus/anchorstack-skills has no SKILL.md at repo root, no directory
literally named "skills" at repo root (only a *file* skills.json), and none
of its 11 root-level directories (.claude, .github, .specify, bin,
components, configurable, context, scripts, setup, specs, universal)
directly contain a SKILL.md — every real skill folder sits one level
deeper: .claude/skills/<name>/SKILL.md (18 skills), universal/<name>/
SKILL.md, configurable/finish/SKILL.md, components/<name>/SKILL.md
  ↓ caused by
the repo's actual skill folders live under the Claude Code-standard
`.claude/skills/<name>/SKILL.md` convention (the same convention this very
product's own CLI writes into via `skillcanon sync`, and the same
convention the New Skill drawer's own `skillFile.ts` targets for local
folder imports) plus a source-organization layer (universal/, configurable/,
components/) the repo's own build tooling (scripts/sync-skills.js) compiles
into .claude/skills/ — none of which the detection algorithm was built to
look inside
  ↓ caused by
**ROOT CAUSE: fetch-external-skill-source.ts's three-shape detection was
designed and tested against a single reference repo's layout
(anthropics/skills, which has a literal root-level `skills/` directory) and
was never extended to recurse, nor to specifically check the
`.claude/skills/` path as a well-known convention — despite that convention
being the standard Claude Code skills location and the one this product's
own CLI/local-folder-import paths already use.**
```

## Root cause

**Code structure gap**: `fetchExternalSkillSource` (`src/bcs/prompt-registry/
application/fetch-external-skill-source.ts`) implements directory-shape
detection that is complete for exactly the one repo it was built/tested
against (`anthropics/skills` — confirmed via GitHub API: root-level `skills/`
dir, matching shape 2) but incomplete for the broader ecosystem of
real-world skill repos, including the specific one this product's own
governance/backlog tooling was built from
(`mlopstapus/anchorstack-skills`). The function scans at most one directory
level below the given source path and only recognizes a directory literally
named `skills`; it has no notion of the `.claude/skills/` convention at all,
even though that convention is: (a) the actual, standard location Claude
Code itself expects skills to live in any repo, (b) the exact shape this
product's own `skillcanon sync` CLI command writes into locally
(`.claude/skills/skillcanon-<slug>/`), and (c) mentioned by name in this
same file's own domain module docstring (`external-skill-source.ts:58-59`,
"the same convention this repo's own `.claude/skills/*` folders... use") —
but only for frontmatter *parsing* convention, never wired into path
*discovery*. Test coverage (`fetch-external-skill-source.test.ts`) mirrors
the same three shapes 1:1 with mocked fixtures, so nothing in the existing
suite could have caught the gap; it was only ever exercised against
synthetic data shaped to match the three known cases.

## Contributing factors

- No test fixture or manual verification ever used a repo with the
  `.claude/skills/` nesting shape — only synthetic mocks covering the three
  already-implemented cases, and (per prior session's live verification)
  `anthropics/skills`, which happens to match shape 2 exactly. A gap that
  matches your own test suite by construction is invisible to that suite.
- The user-facing error message ("...at the repository root, under a
  'skills/' directory, or in a top-level subdirectory") accurately describes
  what the code checks, but doesn't help a user whose repo instead uses the
  `.claude/skills/` convention self-diagnose — it reads as "your repo has no
  skills" rather than "point me at a subpath."
- The drawer's `npx skills add <source>` hint (dead UI copy carried over
  verbatim from a design mockup, already flagged in prior session notes) is
  a separate, cosmetic issue that adds confusion on top of the real bug —
  a user seeing that text reasonably assumes a working CLI import path
  exists, when only the web UI's "Fetch skills" button is real.

## Evidence gaps

None — reproduction confirmed directly against the live GitHub API (traced
`fetchExternalSkillSource`'s exact algorithm by hand against
`mlopstapus/anchorstack-skills`'s real directory tree) and cross-checked
against `anthropics/skills`'s layout to confirm what the algorithm *was*
built to handle.

## Fix

Two independent, additive fixes — neither is a workaround, both close real
gaps:

1. **Add `.claude/skills/` as a fourth, explicitly-checked shape** in
   `fetchExternalSkillSource` (`fetch-external-skill-source.ts`), checked
   before falling back to shape 3's one-level top-level scan: if a
   `.claude/skills` directory exists relative to the given path, scan its
   immediate children the same way shape 2 already scans a root-level
   `skills/` directory. This is the standard Claude Code convention and
   should be checked unconditionally, not just when the user manually
   supplies a `.claude/skills` subpath.
2. **Recurse one additional level for shape 3** (or generalize shapes 2/3
   into a single bounded-depth recursive scan, capped by the existing
   `MAX_DIRECTORIES_SCANNED`/`MAX_EXTERNAL_SKILLS_PER_SOURCE` limits) so
   repos organizing skills under a category layer (this repo's own
   `universal/`, `configurable/`, `components/`) are discoverable without
   the user needing to know and manually supply the exact subpath.
3. Separately (cosmetic, not part of this root cause but same feature
   surface): replace the dead `npx skills add <source>` hint text in
   `new-prompt-drawer.tsx:403` with either a real command or remove it —
   already tracked as a known gap in prior session notes, worth fixing in
   the same change since it's directly adjacent and actively misleading
   users investigating this exact failure.

## Prevention

Add a test fixture (or a live-repo smoke test, matching the pattern
`github-skill-source.test.ts` already mocks) specifically for the
`.claude/skills/<name>/SKILL.md` nested-under-dotdir shape — the single
most standard real-world layout — so future changes to the detection
algorithm can't silently regress it the way the original implementation
never covered it in the first place. More generally: when a feature reads
external, org-owned content whose shape isn't fully controlled by this
codebase, validate the detection logic against at least one *dogfooded*
real-world repo the team actually owns (this repo already had one ready
to hand — its own skill governance tooling's source repo) before
considering directory-shape detection "done," not just synthetic mocks.
