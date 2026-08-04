import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NavigationList } from "./app-navigation";

describe("NavigationList", () => {
  it("renders both labeled sections and all eight real hrefs", () => {
    const markup = renderToStaticMarkup(
      <NavigationList pathname="/dashboard" teamId="team-123" />,
    );

    expect(markup).toContain("Workspace");
    expect(markup).toContain("Settings");
    for (const href of [
      "/dashboard",
      "/prompts",
      "/teams/team-123/policies",
      "/teams",
      "/projects",
      "/metrics",
      "/settings/api-keys",
      "/settings/audit-log",
    ]) {
      expect(markup).toContain(`href="${href}"`);
    }
  });

  it("never renders a separate Workflows nav entry — chain and template skills share the Prompts nav item (027-skill-chain-views-ui, FR-016)", () => {
    const markup = renderToStaticMarkup(
      <NavigationList pathname="/dashboard" teamId="team-123" />,
    );
    expect(markup).not.toContain("Workflows");
    expect(markup).not.toContain("/workflows");
  });

  it("marks exactly one ownership-aware item as the current page", () => {
    const markup = renderToStaticMarkup(
      <NavigationList
        pathname="/teams/team-123/objectives/objective-123"
        teamId="team-123"
      />,
    );

    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toMatch(
      /aria-current="page"[^>]*>[\s\S]*?Governance[\s\S]*?<\/a>/,
    );
  });
});
