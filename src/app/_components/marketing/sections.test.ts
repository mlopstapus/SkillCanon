import { describe, expect, it } from "vitest";
import { DOCS_URL, NAV_ANCHOR_LINKS, QUICKSTART_HREF, REPO_URL } from "./sections";

describe("sections", () => {
  it("lists all five nav anchor links in source-design order", () => {
    expect(NAV_ANCHOR_LINKS).toEqual([
      { id: "how", label: "How it works", href: "#how" },
      { id: "governance", label: "Governance", href: "#governance" },
      { id: "features", label: "Features", href: "#features" },
      { id: "integrations", label: "Integrations", href: "#integrations" },
      { id: "quickstart", label: "Quickstart", href: "#quickstart" },
    ]);
  });

  it("points the quickstart CTA href at the in-page anchor", () => {
    expect(QUICKSTART_HREF).toBe("#quickstart");
  });

  it("points Docs/GitHub at the real repository, not the mockup's placeholder org", () => {
    expect(REPO_URL).toBe("https://github.com/mlopstapus/SkillCanon");
    expect(DOCS_URL).toBe("https://github.com/mlopstapus/SkillCanon/tree/main/docs");
  });
});
