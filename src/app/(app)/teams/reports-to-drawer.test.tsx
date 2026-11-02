import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UserAccountSummary } from "@/bcs/identity-access";
import { ReportsToDrawer } from "./reports-to-drawer";

const now = new Date("2026-01-01T00:00:00Z");
const user = (id: string, displayName: string, managerId: string | null = null): UserAccountSummary => ({
  id,
  organizationId: "org-1",
  teamId: "team-1",
  username: displayName.toLowerCase(),
  displayName,
  email: `${displayName.toLowerCase()}@example.test`,
  role: "member",
  isActive: true,
  managerId,
  createdAt: now,
  updatedAt: now,
});

describe("ReportsToDrawer", () => {
  it("offers everyone but the person themself, plus No one, with the current manager selected", () => {
    const html = renderToStaticMarkup(
      <ReportsToDrawer
        target={user("u-1", "Kai", "u-2")}
        users={[user("u-1", "Kai"), user("u-2", "Morgan"), user("u-3", "Riley")]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(html).toContain("Reports to");
    expect(html).toContain(">No one<");
    expect(html).toContain("Morgan (morgan@example.test)");
    expect(html).toContain("Riley (riley@example.test)");
    expect(html).not.toContain("Kai (kai@example.test)");
    expect(html).toMatch(/<option value="u-2" selected/);
  });
});
