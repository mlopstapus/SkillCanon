"use client";

import { useEffect, useState } from "react";
import { MARKETING_ROOT_ID, otherTheme, persistTheme, type Theme } from "./theme";

export function ThemeToggle() {
  // Always starts "dark" so the client's first hydration pass matches the
  // server-rendered markup exactly (no hydration mismatch to suppress). The
  // effect below then does a genuine post-mount update — not a hydration
  // reconciliation — so React actually repaints the icon/state to match
  // whatever the blocking init script (theme.ts) already applied to the DOM.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const root = document.getElementById(MARKETING_ROOT_ID);
    if (root?.getAttribute("data-theme") === "light") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from a DOM attribute an external script (not React) owns, not a subscription candidate
      setTheme("light");
    }
  }, []);

  function handleToggle() {
    const next = otherTheme(theme);
    const root = document.getElementById(MARKETING_ROOT_ID);
    if (root) {
      if (next === "light") {
        root.setAttribute("data-theme", "light");
      } else {
        root.removeAttribute("data-theme");
      }
    }
    persistTheme(window.localStorage, next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      title="Toggle theme"
      onClick={handleToggle}
      className="grid size-9 place-items-center rounded-tile border border-border bg-surface text-dim transition-colors hover:border-border2 hover:text-text"
    >
      {theme === "dark" ? "☾" : "☀"}
    </button>
  );
}
