import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AppSessionUser } from "@/bcs/identity-access";
import { AppShell } from "./app-shell";

const user: AppSessionUser = {
  id: "user-123",
  orgId: "org-123",
  teamId: "team-123",
  role: "admin",
  email: "jane@example.com",
  displayName: "Jane Doe",
  teamName: "Platform",
};

describe("AppShell", () => {
  it("composes navigation, account identity, and protected child content", () => {
    const markup = renderToStaticMarkup(
      <AppShell navigation={<nav>Workspace navigation</nav>} user={user}>
        <main>Protected child content</main>
      </AppShell>,
    );

    expect(markup).toContain("Workspace navigation");
    expect(markup).toContain("Jane Doe");
    expect(markup).toContain("Admin · Platform");
    expect(markup).toContain("Protected child content");
  });

  it("renders a mobile nav toggle, closed by default, with the off-canvas nav hidden and correctly wired via ARIA", () => {
    const markup = renderToStaticMarkup(
      <AppShell navigation={<nav>Workspace navigation</nav>} user={user}>
        <main>Protected child content</main>
      </AppShell>,
    );

    expect(markup).toContain('aria-label="Open navigation"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls="app-shell-nav"');
    expect(markup).toContain('id="app-shell-nav"');
    // Off-canvas aside starts hidden (not just visually offset) so its links
    // are out of tab order until opened.
    const asideTag = markup.match(/<aside[^>]*>/)?.[0] ?? "";
    expect(asideTag).toContain('id="app-shell-nav"');
    expect(asideTag).toMatch(/class="[^"]*\bhidden\b/);
    expect(markup).toContain('aria-label="Close navigation"');
  });
});
