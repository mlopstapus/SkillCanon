import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AppSessionUser, OrgSummary } from "@/bcs/identity-access";
import { WelcomePageContent } from "./page";

const user: AppSessionUser = {
  id: "user-123",
  orgId: "org-123",
  teamId: "team-123",
  role: "admin",
  email: "jane@example.com",
  displayName: "Jane Doe",
  teamName: "Platform",
};

const organization: OrgSummary = {
  id: "org-123",
  name: "Acme Ops",
  slug: "acme-ops",
  planId: null,
};

describe("WelcomePageContent", () => {
  it("renders heading, stat tiles, and dashboard CTA", () => {
    const markup = renderToStaticMarkup(
      <WelcomePageContent user={user} organization={organization} />,
    );

    expect(markup).toContain("Welcome, Jane Doe.");
    expect(markup).toContain("Org name");
    expect(markup).toContain("Acme Ops");
    expect(markup).toContain("Root team");
    expect(markup).toContain("Platform");
    expect(markup).toContain("You");
    expect(markup).toContain("Admin");
    expect(markup).toMatch(/href="\/dashboard"[^>]*>[\s\S]{0,80}Enter SkillCanon/);
  });
});
