import { describe, expect, it } from "vitest";
import { DEFAULT_HERO_VIEW, otherHeroView } from "./hero-panel";

describe("hero panel view state", () => {
  it("defaults to the installed-skills view", () => {
    expect(DEFAULT_HERO_VIEW).toBe("skills");
  });

  it("toggles between skills and graph and back", () => {
    expect(otherHeroView("skills")).toBe("graph");
    expect(otherHeroView("graph")).toBe("skills");
  });
});
