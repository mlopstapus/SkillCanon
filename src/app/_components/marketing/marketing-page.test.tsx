import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "../../page";

describe("Home (marketing landing page)", () => {
  const markup = renderToStaticMarkup(<Home />);

  it("renders the hero headline, subhead, and CTAs", () => {
    expect(markup).toContain("Govern every prompt");
    expect(markup).toContain("your engineers ship");
    expect(markup).toContain("SkillCanon never calls an LLM");
    expect(markup).toMatch(/href="#quickstart"[^>]*>[\s\S]{0,80}Deploy in 2 minutes/);
    expect(markup).toMatch(/href="#how"[^>]*>[\s\S]{0,40}See how it works/);
  });

  it("renders the trust strip's supported agents", () => {
    for (const agent of ["Claude Code", "Windsurf", "Cursor", "Copilot", "any agent"]) {
      expect(markup).toContain(agent);
    }
  });

  it("renders how-it-works's four steps under id=how", () => {
    expect(markup).toContain('id="how"');
    for (const step of ["Define", "Govern", "Distribute", "Expand"]) {
      expect(markup).toContain(step);
    }
  });

  it("renders the governance section under id=governance", () => {
    expect(markup).toContain('id="governance"');
    expect(markup).toContain("Two-layer inheritance");
    expect(markup).toContain("3 policies");
    expect(markup).toContain("2 objectives applied");
  });

  it("renders all six feature cards under id=features", () => {
    expect(markup).toContain('id="features"');
    for (const feature of [
      "Prompt Registry",
      "Skill Distribution",
      "Hierarchical Teams",
      "Policy Enforcement",
      "Objective Tracking",
      "Workflows",
    ]) {
      expect(markup).toContain(feature);
    }
  });

  it("renders the integrations checklist and default cli sample under id=integrations/quickstart", () => {
    expect(markup).toContain('id="integrations"');
    expect(markup).toContain('id="quickstart"');
    expect(markup).toContain("skillcanon init");
    for (const item of ["Claude Code", "REST API", "CI / CD"]) {
      expect(markup).toContain(item);
    }
  });

  it("renders the compliance callout with softened, non-certification wording (FR-014)", () => {
    expect(markup).toContain("Built for SOC2");
    expect(markup).toContain("NIST-aligned controls");
    expect(markup).toContain("100%");
    expect(markup).toContain("0");
    expect(markup).not.toContain("SOC2 control-aligned");
    expect(markup).not.toContain("NIST framework aligned");
  });

  it("renders the final CTA linking to quickstart (FR-012)", () => {
    expect(markup).toContain("Ship prompts like");
    expect(markup).toMatch(/href="#quickstart"[^>]*>[\s\S]{0,40}Deploy SkillCanon/);
  });

  it("renders the footer with product mark, license, and links", () => {
    expect(markup).toContain("Apache-2.0");
    expect(markup).toMatch(/href="https:\/\/github\.com\/mlopstapus\/SkillCanon\/tree\/main\/docs"[^>]*>Docs/);
    expect(markup).toMatch(/href="https:\/\/github\.com\/mlopstapus\/SkillCanon"[^>]*>GitHub/);
  });
});
