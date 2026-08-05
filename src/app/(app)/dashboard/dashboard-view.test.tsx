import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expectNoCriticalOrSeriousAxeViolations } from "@/shared/testing/accessibility";
import { DashboardView, type DashboardData } from "./dashboard-view";

function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    orgName: "Acme Corp",
    teamCount: 3,
    memberCount: 12,
    projectCount: 4,
    promptCount: 8,
    usage: { totalInvocations: 120, successCount: 110, failureCount: 10, windowLabel: "2026-07-06 to 2026-08-05" },
    recentPrompts: [
      { name: "commit-message", description: "Generates a commit message", updatedAt: "2026-08-04" },
      { name: "release-notes", description: null, updatedAt: "2026-08-01" },
    ],
    ...overrides,
  };
}

describe("DashboardView", () => {
  it("renders the org name and workspace snapshot counts", () => {
    const html = renderToStaticMarkup(<DashboardView data={makeData()} />);

    expect(html).toContain("Acme Corp");
    expect(html).toContain("Teams");
    expect(html).toContain("Members");
    expect(html).toContain("Projects");
    expect(html).toContain("Prompts");
    expect(html).toContain(">3<");
    expect(html).toContain(">12<");
  });

  it("renders the usage window summary", () => {
    const html = renderToStaticMarkup(<DashboardView data={makeData()} />);

    expect(html).toContain("2026-07-06 to 2026-08-05");
    expect(html).toContain(">120<");
    expect(html).toContain(">110<");
    expect(html).toContain(">10<");
  });

  it("lists recent prompts as links to their detail page", () => {
    const html = renderToStaticMarkup(<DashboardView data={makeData()} />);

    expect(html).toContain("commit-message");
    expect(html).toContain('href="/prompts/commit-message"');
    expect(html).toContain("release-notes");
  });

  it("shows the shared empty state when there are no prompts yet", async () => {
    const html = renderToStaticMarkup(<DashboardView data={makeData({ recentPrompts: [] })} />);

    expect(html).toContain("No prompts yet");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    await expectNoCriticalOrSeriousAxeViolations(html);
  });

  it("has no critical or serious accessibility violations with data present", async () => {
    const html = renderToStaticMarkup(<DashboardView data={makeData()} />);
    await expectNoCriticalOrSeriousAxeViolations(html);
  });
});
