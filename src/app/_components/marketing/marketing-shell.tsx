import { MARKETING_ROOT_ID, themeInitScript } from "./theme";

/**
 * Wraps the marketing page's content in the one element the light/dark
 * `data-theme` attribute may ever be set on — never <html>/<body>, which the
 * root layout shares with (app) routes. Also renders the mockup's ambient
 * background layers and the blocking theme-init script (see theme.ts).
 */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      id={MARKETING_ROOT_ID}
      // The blocking init script below mutates this element's data-theme
      // attribute before hydration runs, which otherwise reads as a
      // server/client mismatch and forces React to discard the correct
      // pre-hydration DOM state. suppressHydrationWarning is the documented
      // escape hatch for exactly this "an external script sets an attribute
      // before hydration" case.
      suppressHydrationWarning
      style={{
        minHeight: "100vh",
        position: "relative",
        // #marketing-root is where `data-theme="light"` is ever set (never
        // <html>/<body>, shared with (app) routes) — so its own background/
        // text color must resolve locally here too. <body>'s background
        // reads --bg from the (always-dark) :root, an ancestor this div's
        // attribute can't reach, so without this the page background would
        // stay dark while descendant text correctly switches to light-theme
        // colors, producing unreadable dark-on-dark text.
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />

      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(900px 500px at 78% -8%, var(--aglow), transparent 60%), radial-gradient(700px 500px at 8% 12%, color-mix(in srgb, var(--a2) 22%, transparent), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          opacity: 0.9,
          backgroundImage:
            "linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
          maskImage:
            "radial-gradient(ellipse 100% 70% at 50% 0%, #000 40%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 100% 70% at 50% 0%, #000 40%, transparent 78%)",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
