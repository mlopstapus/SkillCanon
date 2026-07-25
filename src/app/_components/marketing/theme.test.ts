import { describe, expect, it } from "vitest";
import {
  MARKETING_ROOT_ID,
  THEME_STORAGE_KEY,
  otherTheme,
  persistTheme,
  readStoredTheme,
  themeInitScript,
} from "./theme";

function fakeStorage(value: string | null) {
  let stored = value;
  return {
    getItem: () => stored,
    setItem: (_key: string, val: string) => {
      stored = val;
    },
  };
}

describe("readStoredTheme", () => {
  it("defaults to dark when nothing is stored (FR-008)", () => {
    expect(readStoredTheme(fakeStorage(null))).toBe("dark");
  });

  it("defaults to dark for any unrecognized stored value", () => {
    expect(readStoredTheme(fakeStorage("sepia"))).toBe("dark");
  });

  it("returns light when light is stored", () => {
    expect(readStoredTheme(fakeStorage("light"))).toBe("light");
  });
});

describe("otherTheme", () => {
  it("flips dark to light and back", () => {
    expect(otherTheme("dark")).toBe("light");
    expect(otherTheme("light")).toBe("dark");
  });
});

describe("persistTheme", () => {
  it("writes the theme under the marketing-scoped storage key", () => {
    const storage = fakeStorage(null);
    persistTheme(storage, "light");
    expect(readStoredTheme(storage)).toBe("light");
  });

  it("round-trips a full toggle: dark -> light -> dark", () => {
    const storage = fakeStorage(null);
    let theme = readStoredTheme(storage);
    expect(theme).toBe("dark");

    theme = otherTheme(theme);
    persistTheme(storage, theme);
    expect(readStoredTheme(storage)).toBe("light");

    theme = otherTheme(theme);
    persistTheme(storage, theme);
    expect(readStoredTheme(storage)).toBe("dark");
  });
});

describe("themeInitScript", () => {
  it("references the real storage key and marketing-root id", () => {
    const script = themeInitScript();
    expect(script).toContain(THEME_STORAGE_KEY);
    expect(script).toContain(MARKETING_ROOT_ID);
    expect(script).toContain('data-theme","light"');
  });
});
