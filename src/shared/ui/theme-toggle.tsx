"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "./theme";
import { cn } from "./utils";

type Theme = "light" | "dark";

export function ThemeToggle({ className }: { className?: string }) {
  // Matches what the server rendered; synced from the DOM after mount, because
  // the init script may already have flipped the attribute before hydration.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from the <html data-theme> the init script set
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    if (next === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode: the choice just won't persist.
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      aria-pressed={theme === "dark"}
      className={cn(
        "grid size-8 place-items-center rounded-control border border-border text-dim transition-colors duration-300 hover:text-text",
        className,
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4">
        {theme === "dark" ? (
          <path d="M10 3.5V2M10 18v-1.5M3.5 10H2M18 10h-1.5M5.4 5.4 4.3 4.3M15.7 15.7l-1.1-1.1M14.6 5.4l1.1-1.1M4.3 15.7l1.1-1.1M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
        ) : (
          <path d="M16.5 11.5A6.5 6.5 0 0 1 8.5 3.5a6.5 6.5 0 1 0 8 8Z" />
        )}
      </svg>
    </button>
  );
}
