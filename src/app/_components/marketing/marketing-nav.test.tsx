import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarketingNav } from "./marketing-nav";

describe("MarketingNav", () => {
  const markup = renderToStaticMarkup(<MarketingNav />);

  it("renders all five in-page anchor links", () => {
    for (const href of ["#how", "#governance", "#features", "#integrations", "#quickstart"]) {
      expect(markup).toContain(`href="${href}"`);
    }
  });

  it("points Docs and GitHub at the real repository, opening in a new tab", () => {
    expect(markup).toMatch(
      /href="https:\/\/github\.com\/mlopstapus\/SkillCanon\/tree\/main\/docs"[^>]*target="_blank"[^>]*rel="noopener"/,
    );
    expect(markup).toMatch(
      /href="https:\/\/github\.com\/mlopstapus\/SkillCanon"[^>]*target="_blank"[^>]*rel="noopener"/,
    );
  });

  it("renders the primary CTA linking to quickstart", () => {
    expect(markup).toMatch(/href="#quickstart"[^>]*>[\s\S]{0,40}Deploy free/);
  });

  it("renders a logo link back to the top", () => {
    expect(markup).toContain('href="#top"');
  });
});
