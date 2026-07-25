# Quickstart: Marketing Landing Page

## Prerequisites

- `pnpm install` (already up to date if you're continuing work on this repo).
- No database/Docker required — this feature reads no data.

## Run

```bash
pnpm dev
```

Open `http://localhost:3000/`.

## Automated checks

```bash
pnpm vitest run src/app/_components/marketing
pnpm typecheck
pnpm lint
pnpm build
```

## Manual verification (do this before calling the feature done — no jsdom in
this repo, so interaction/visual checks are done in a real browser)

1. **Content parity**: scroll top to bottom; every section from
   `contracts/marketing-page-ui.md`'s Section contract is present with real
   copy (no lorem ipsum), matching `SkillCanon Landing.dc.html` (fetch via
   `DesignSync get_file` again if you need a side-by-side reference).
2. **Nav anchors**: click "How it works," "Governance," "Features,"
   "Integrations," and "Quickstart" in the nav — each scrolls to its section.
   Load `http://localhost:3000/#governance` directly and confirm it opens
   already scrolled there.
3. **External links**: click "Docs" and the GitHub link — both open
   `github.com/mlopstapus/SkillCanon` (respectively its `docs/` dir and repo
   root) in a new tab.
4. **Theme toggle**: click the theme toggle in the nav — every section's
   colors switch together (no stale-theme section). Toggle back to dark.
   Reload the page — the last-chosen theme persists. Open DevTools →
   Application → Local Storage and confirm the `skillcanon-marketing-theme`
   key holds the current value.
5. **Reduced motion**: in Chrome DevTools, enable "Emulate CSS media feature
   prefers-reduced-motion: reduce," reload, and confirm all sections are
   immediately visible with no reveal animation.
6. **No-JS fallback**: disable JavaScript (DevTools → Cmd+Shift+P → "Disable
   JavaScript"), reload, and confirm every section's text content is still
   present in the rendered page (theme toggle/hero panel/tabs are expected to
   be inert).
7. **Hero panel toggle**: click the alternate hero view control — the panel
   swaps from the installed-skills list to the dependency graph and back.
8. **Integration tabs**: click each of the three tabs in the Integrations
   section — the code sample swaps and only the active tab is visually
   selected.
9. **Responsive check**: resize the viewport (or use DevTools device
   toolbar) to a common mobile width (~375px) and a tablet width (~768px) —
   confirm every section remains legible with no horizontal overflow.
10. **Metadata**: `curl -s http://localhost:3000/ | grep -E "og:|twitter:|<title"`
    and confirm title, description, and Open Graph/Twitter tags are present
    and non-empty. Visit `http://localhost:3000/icon` (or check the browser
    tab) for the generated favicon and `http://localhost:3000/opengraph-image`
    for the generated share image.

## Expected outcome

All ten sections render with real content in both themes, every nav anchor
and external link resolves correctly, the theme choice survives a reload, and
the page remains fully usable with JavaScript disabled or reduced motion
enabled — matching spec.md's Success Criteria SC-001 through SC-006.
