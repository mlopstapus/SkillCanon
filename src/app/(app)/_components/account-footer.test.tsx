import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AppSessionUser } from "@/bcs/identity-access";
import { AccountFooter } from "./account-footer";

const user: AppSessionUser = {
  id: "user-123",
  orgId: "org-123",
  teamId: "team-123",
  role: "admin",
  email: "jane@example.com",
  displayName: "Jane Doe",
  teamName: "Platform",
};

describe("AccountFooter", () => {
  it("renders live non-secret identity with a decorative chevron", () => {
    const markup = renderToStaticMarkup(<AccountFooter user={user} />);

    expect(markup).toContain(">J<");
    expect(markup).toContain("Jane Doe");
    expect(markup).toContain("Admin · Platform");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("jane@example.com");
    expect(markup).not.toContain("placeholder");
  });

  it("renders \"Unassigned\" instead of crashing/blanking when teamName is null (019-account-team-settings-ui)", () => {
    const unassignedUser: AppSessionUser = {
      ...user,
      teamId: null,
      teamName: null,
    };

    const markup = renderToStaticMarkup(
      <AccountFooter user={unassignedUser} />,
    );

    expect(markup).toContain("Admin · Unassigned");
  });

  it("renders a Log out control in the account menu (011-logout-ui-wiring)", () => {
    const markup = renderToStaticMarkup(<AccountFooter user={user} />);

    expect(markup).toContain("Log out");
    // The menu toggle button must be a real, labeled control — not just the
    // decorative chevron icon.
    expect(markup).toContain('aria-label="Account menu"');
    expect(markup).toContain('aria-expanded="false"');
  });
});
