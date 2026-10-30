# Plan
- globals.css: light default + dark theme tokens, shadows, scrim, focus, motion, serif weight, reduced motion; `a` colour moved into the base layer (a pre-existing bug made text-a-fg on links lose).
- layout: drop next/font/google, add pre-paint theme script; shared/ui theme-toggle + theme constants; toggle in app shell and auth layout.
- Replace bg-black scrims and text-white; eyebrow accent text -> ink; favicon recolour.
- Tests: existing unit suites, e2e theme persistence + axe colour-contrast in both themes.
