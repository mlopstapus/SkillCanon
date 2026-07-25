// Theme persistence for the marketing landing page only. Scoped to a
// dedicated storage key and a `data-theme` attribute on the marketing page's
// own wrapper element (#marketing-root) — never on <html>/<body>, and never
// read or written by any (app) route. See
// specs/014-marketing-landing-page/research.md's Theme persistence decision.

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "skillcanon-marketing-theme";

export const MARKETING_ROOT_ID = "marketing-root";

export function readStoredTheme(storage: Pick<Storage, "getItem">): Theme {
  return storage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

export function persistTheme(
  storage: Pick<Storage, "setItem">,
  theme: Theme,
): void {
  storage.setItem(THEME_STORAGE_KEY, theme);
}

/**
 * Source for a blocking inline <script>, rendered as the first child of
 * #marketing-root, that applies a stored "light" preference before first
 * paint to avoid a flash of the wrong theme. Runs before hydration, so it
 * cannot rely on any module import — it re-derives the storage key inline.
 */
export function themeInitScript(): string {
  return `(function(){try{var t=localStorage.getItem(${JSON.stringify(
    THEME_STORAGE_KEY,
  )});if(t==="light"){var el=document.getElementById(${JSON.stringify(
    MARKETING_ROOT_ID,
  )});if(el)el.setAttribute("data-theme","light");}}catch(e){}})();`;
}
