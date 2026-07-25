# Feature Specification: Marketing Landing Page

**Feature Branch**: `014-marketing-landing-page`

**Created**: 2026-07-24

**Status**: Draft

**Input**: User description: "backlog/004-app-shell-and-landing/003-marketing-landing-page.md"

## Clarifications

### Session 2026-07-24

- Q: The mockup's compliance stat tiles read "SOC2 control-aligned" / "NIST framework aligned" verbatim. Given SOC2/NIST are in scope but not yet formally certified, how should this copy be handled? → A: Keep the same stat tiles but soften wording (e.g., "Built for SOC2" / "NIST-aligned controls") to avoid implying formal certification.
- Q: Should the visitor's light/dark theme choice persist beyond the current page view? → A: Persist in the visitor's browser (e.g., localStorage) so it survives reloads and future visits; default to dark only on the very first visit with no stored preference.
- Q: What should the nav's GitHub link and Docs link point to, given the mockup's placeholder `skillcanon/skillcanon` org doesn't exist? → A: The real repository, `github.com/mlopstapus/SkillCanon` (and its `docs/` subdirectory) — the only actual public location today; the star count remains static illustrative text, not live-fetched.
- Q: Should this feature include SEO/social-sharing metadata (title, meta description, Open Graph/Twitter card, favicon)? → A: Yes — add a baseline requirement for descriptive page title, meta description, Open Graph/Twitter card tags, and favicon.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Evaluate the product from the homepage (Priority: P1)

A prospective adopter (an engineering lead or platform engineer researching prompt-governance tools) lands on the public homepage without an account. They read the hero pitch, scan the "how it works" flow, the governance model, and the feature set, and decide whether SkillCanon fits their needs — entirely before signing up or logging in.

**Why this priority**: This is the only page most prospective users see before deciding whether to invest further. Without it, there is no public-facing explanation of the product at all.

**Independent Test**: Load the homepage while unauthenticated and confirm the hero, "how it works," governance, and features sections render with real content matching the source design.

**Acceptance Scenarios**:

1. **Given** an unauthenticated visitor navigates to the site's homepage, **When** the page loads, **Then** they see the hero headline, subheading, primary/secondary calls to action, and the trust strip listing supported coding agents.
2. **Given** the visitor scrolls down the page, **When** each section enters the viewport, **Then** the "How it works," "Governance," "Features," "Integrations," compliance, and final call-to-action sections are all present with their full content from the source design.
3. **Given** the visitor reaches the footer, **When** they view it, **Then** they see the product mark, license label, and footer links (Docs, GitHub, API reference, Architecture).

---

### User Story 2 - Jump to a section via the nav (Priority: P1)

A visitor uses the top navigation to jump directly to the part of the page they care about (e.g., "Governance" for a compliance-focused evaluator, "Quickstart" for a developer ready to try it) instead of scrolling manually.

**Why this priority**: The nav's anchor links are the page's primary in-page wayfinding mechanism and are called out explicitly as an acceptance criterion in the originating backlog item.

**Independent Test**: Click each nav link in isolation and confirm the viewport scrolls to the matching section.

**Acceptance Scenarios**:

1. **Given** the visitor is anywhere on the homepage, **When** they click "How it works," "Governance," "Features," "Integrations," or "Quickstart" in the nav, **Then** the page smoothly scrolls to the corresponding section.
2. **Given** the visitor clicks "Docs" in the nav, **When** the link is followed, **Then** it opens `github.com/mlopstapus/SkillCanon`'s `docs/` directory in a new tab.
3. **Given** the visitor clicks the GitHub link in the nav, **When** the link is followed, **Then** it opens `github.com/mlopstapus/SkillCanon` in a new tab.

---

### User Story 3 - Switch between light and dark theme (Priority: P2)

A visitor toggles the page's theme to match their preference or ambient lighting, independent of the always-dark authenticated app.

**Why this priority**: Explicitly required by the backlog item and is the one place in the product where a light theme exists at all; lower priority than the content itself since the page is usable and readable in its default theme without ever toggling.

**Independent Test**: Toggle the theme control and confirm every section's colors switch to the corresponding palette and the choice is visually consistent across the whole page (no section left in the stale theme).

**Acceptance Scenarios**:

1. **Given** the page loads in its default theme, **When** the visitor clicks the theme toggle in the nav, **Then** the entire page (background, surfaces, text, borders, accent) switches to the other theme's palette.
2. **Given** the page is in light theme, **When** the visitor toggles again, **Then** it switches back to dark theme.
3. **Given** the visitor has toggled the theme, **When** they navigate within the page (e.g., via a nav anchor link) or reload/return to the page later, **Then** the chosen theme persists.

---

### User Story 4 - Explore interactive hero and integration demos (Priority: P3)

A visitor explores the two small interactive demos on the page: the hero panel toggle (installed-skills list vs. team/policy dependency graph) and the integrations code-sample tabs (CLI, skill file, curl).

**Why this priority**: These are illustrative, secondary details that enrich the pitch but aren't required to understand or evaluate the product — the page's core message stands without them being interacted with.

**Independent Test**: Toggle each control independently and confirm the corresponding panel/tab swaps content while the other stays inert.

**Acceptance Scenarios**:

1. **Given** the hero visual defaults to the installed-skills view, **When** the visitor clicks the alternate view control, **Then** the panel swaps to the team/policy dependency graph and back on toggle.
2. **Given** the integrations panel defaults to the CLI code sample, **When** the visitor selects the "skill.md" or "curl" tab, **Then** the displayed code sample switches accordingly, and the previously active tab is visually deselected.

---

### Edge Cases

- What happens when a visitor follows a direct link with a section's URL fragment (e.g., `/#governance`)? The page loads already scrolled to that section.
- What happens when a visitor's browser has reduced-motion preferences enabled? Scroll-triggered reveal animations and hover transitions should not block content from becoming visible — content must not remain hidden if an animation fails to fire.
- What happens when JavaScript fails to load or execute? Content in every section must still be present and readable in the initial (default-theme) markup; only the theme toggle, hero panel toggle, and integration tabs are expected to be inert.
- What happens on narrow (mobile-width) viewports? All sections must remain legible and usable; the mockup's fixed multi-column layouts are a desktop reference, not a literal pixel spec — reflow is expected and acceptable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The page MUST be reachable at the site's root URL for unauthenticated visitors, replacing the current placeholder scaffold content there.
- **FR-002**: The page MUST NOT require authentication or an account, and MUST NOT perform any session/auth-gating check.
- **FR-003**: The nav MUST display, in order: a home/logo link, anchor links for "How it works," "Governance," "Features," "Integrations," and "Quickstart," an external "Docs" link to `github.com/mlopstapus/SkillCanon`'s `docs/` directory, an external link to `github.com/mlopstapus/SkillCanon`, a theme toggle control, and a primary call-to-action.
- **FR-004**: Each nav anchor link MUST scroll the page to its corresponding section without a full page navigation/reload.
- **FR-005**: The page MUST render, in order, all sections present in the source design: hero, trust strip (supported coding agents), "How it works" (four-step flow), "Governance" (inheritance model description + policy-resolution example), "Features" (platform capability cards), "Integrations" (integration checklist + tabbed code samples), compliance callout (SOC2/NIST/self-hosted/no-LLM-calls stats), final call-to-action, and footer.
- **FR-006**: The page MUST support both a light and a dark visual theme, each using the token values defined for this page in `docs/context/design-system.md`.
- **FR-007**: Visitors MUST be able to toggle between light and dark theme via a control in the nav, and the selection MUST apply consistently to every section on the page.
- **FR-008**: The theme toggle MUST default to dark theme on first visit for a visitor with no prior preference, and the chosen theme MUST persist client-side (e.g., via local browser storage) across reloads and future visits to the page.
- **FR-009**: The hero section MUST provide a control to switch its visual between an installed-skills list view and a team/policy dependency graph view.
- **FR-010**: The "Integrations" section MUST provide tabs to switch its code sample between a CLI transcript, a skill definition file, and a curl example.
- **FR-011**: All page content (copy, headings, statistics, links) MUST match the source design (`SkillCanon Landing.dc.html`) rather than placeholder or lorem-ipsum text.
- **FR-012**: The page's calls-to-action that do not yet have a defined destination in this codebase (e.g., "Deploy free," "Deploy in 2 minutes," "Deploy SkillCanon") MUST link to the Quickstart section of this same page rather than a dead or external placeholder link.
- **FR-013**: The page MUST provide baseline discoverability metadata: a descriptive `<title>`, a meta description summarizing the product pitch, Open Graph and Twitter card tags (title, description, and a share image), and a favicon.
- **FR-014**: The compliance callout's SOC2 and NIST stat tiles (part of FR-005) MUST use alignment/intent wording (e.g., "Built for SOC2," "NIST-aligned controls") rather than the mockup's literal "control-aligned"/"framework aligned" phrasing, so the page never implies a formal certification the product does not yet hold.

### Key Entities

_None — this page is static marketing content with no persisted data._

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An unauthenticated visitor can view the complete homepage content (hero through footer) without any login prompt or redirect.
- **SC-002**: Every nav anchor link (How it works, Governance, Features, Integrations, Quickstart) scrolls to its correct section on 100% of attempts.
- **SC-003**: A visitor can switch the page between light and dark theme in one interaction, with the change visible across the entire page within the same interaction (no partial/mixed-theme state).
- **SC-004**: The rendered page is visually equivalent to the source design (`SkillCanon Landing.dc.html`) in both theme states, as judged by side-by-side comparison of each section.
- **SC-005**: The page remains fully readable and navigable at common mobile, tablet, and desktop viewport widths.
- **SC-006**: A link to the homepage shared on social media or messaging platforms shows a descriptive title, summary, and preview image rather than a bare URL or blank card.

## Assumptions

- **Scope resolved**: the originating backlog item's open question ("is a public marketing site in scope for this repo?") is resolved in favor of yes, in-app — `docs/context/design-system.md` already documents a "marketing" surface as one of the product's two token contexts, `004-app-shell-and-landing/archive/001-design-tokens-and-theming.md` already built and scoped a light-theme override specifically "for `003-marketing-landing-page.md`'s use," and the current root route (`src/app/page.tsx`) is an explicitly-labeled placeholder scaffold page with no other claim on that route. This page replaces that placeholder at the site's root URL rather than living on a separate subdomain or repo.
- The mockup's account-side elements (GitHub star count, "4.2k") are illustrative sample data, not a live-fetched value — the page renders it as static display copy rather than calling out to GitHub's API.
- The mockup's canvas-only "accent color" theming knob (teal/violet/blue/lime, used for previewing the design system itself) is a design-tool feature, not a visitor-facing product feature, and is out of scope — only the light/dark theme toggle is implemented.
- Scroll-reveal-on-viewport-entry animations and hover micro-interactions from the mockup are treated as visual polish to preserve, not as functional requirements with independent acceptance criteria — covered by the edge case that content must never be blocked from appearing.
- "Deploy free" / "Deploy in 2 minutes" / "Deploy SkillCanon" calls-to-action have no self-serve deploy flow built yet anywhere in this codebase; per FR-012 they route to the Quickstart section rather than linking externally or being left non-functional.
