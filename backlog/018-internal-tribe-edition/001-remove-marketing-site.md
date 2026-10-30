---
epic: 018-internal-tribe-edition
feature: 001-remove-marketing-site
status: open
dependencies: []
---

# Remove the Marketing Site

## Requirements

- [ ] `/` has no public page. A signed-in visitor goes to `/dashboard`, and a signed-out visitor goes to `/login`, or to first-run setup when the instance has no admin.
- [ ] Delete `src/app/_components/marketing/` and its tests. Move anything the app still imports from it (for example the theme toggle or `theme.ts`) into the app's shared UI first.
- [ ] Delete `src/app/opengraph-image.tsx`, and remove the Open Graph and Twitter metadata from `src/app/page.tsx`.
- [ ] Ask search engines not to index the instance: `robots` metadata set to `noindex, nofollow` in the root layout, or a `robots.ts` that disallows everything.
- [ ] Update `e2e/ui-walk.e2e.test.ts`. The landing-page tests become "`/` redirects signed-out visitors to sign-in". If the theme-toggle test still applies, it moves to wherever the toggle now lives.

## Acceptance Criteria

- [ ] `curl -sI localhost:3000/` on a fresh instance returns a redirect, not a 200 with marketing HTML.
- [ ] `grep -ri "trust-strip\|final-cta\|compliance-cta" src` returns nothing.
- [ ] `pnpm test:e2e` is green on a fresh instance.

## Technical Notes

- `src/app/(auth)/auth-redirect.ts` already decides between authenticated, setup and login. Reuse it rather than writing a second check.
