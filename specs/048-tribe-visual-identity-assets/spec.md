# Feature Specification: Tribe Visual Identity (part 2: fonts, logo, labels)

**Source**: `backlog/018-internal-tribe-edition/003-tribe-visual-identity.md`; follows part 1 (#127). Decision D5 option (b): the repository is public, so licensed fonts and trademarked logos are loaded at deploy time from a private folder, never committed.

## Requirements
- FR-001 `BRAND_ASSETS_DIR` (a copy of the tribe-design skill's `brand/assets`: `fonts/`, `logos/`) enables Tribe fonts and logo; unset means system fonts and the SkillCanon mark.
- FR-002 `/brand/fonts/*`, `/brand/logos/*` serve only allow-listed file types from those two folders (no traversal); `/brand/fonts.css` is generated from the faces present. All 404 when unset.
- FR-003 With the symbol pair present, `<html data-brand="tribe">`; `LogoMark` and the favicon show the Tribe symbol (inverted on dark), unmodified.
- FR-004 Eyebrows, labels and buttons use the caption face (uppercase, tracked) instead of monospace; monospace stays for code and keys.

## Out of scope
The `Wordmark` text (decision D6), Ben's review of the screenshots against the brand guide, supplying the asset folder.
