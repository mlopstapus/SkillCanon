import { describe, expect, it } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases organization names", () => {
    expect(slugify("Acme Platform Ops")).toBe("acme-platform-ops");
  });

  it("collapses non-alphanumeric runs", () => {
    expect(slugify("Acme: Platform / Ops!!!")).toBe("acme-platform-ops");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  --Acme--  ")).toBe("acme");
  });
});
