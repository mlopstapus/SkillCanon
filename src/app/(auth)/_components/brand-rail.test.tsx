import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandRail } from "./brand-rail";

describe("BrandRail", () => {
  it("says what the tool is for at Tribe, without marketing vocabulary", () => {
    const markup = renderToStaticMarkup(<BrandRail />);

    expect(markup).toContain("One home for the skills we ship.");
    expect(markup).toContain("Internal to Tribe");
    expect(markup).not.toMatch(/control plane|self-hosted|tenant-aware|seamless|empower|cutting-edge|world-class|best-in-class|SOC ?2/i);
  });
});
