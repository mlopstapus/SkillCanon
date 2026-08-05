import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { expectNoCriticalOrSeriousAxeViolations } from "@/shared/testing/accessibility";
import { ProjectsListView, type ProjectListRow } from "./projects-list-view";

const rows: ProjectListRow[] = [
  {
    id: "proj-1",
    name: "Eval Harness",
    description: "Prompt evaluation and regression harness.",
    teamLabel: "MLOps",
    leadLabel: "alice",
    memberCount: 2,
    promptCount: 3,
  },
];

describe("ProjectsListView", () => {
  it("renders each project's name, team, lead, member count, and prompt count", () => {
    const html = renderToStaticMarkup(<ProjectsListView rows={rows} onNewProject={vi.fn()} />);

    expect(html).toContain("Eval Harness");
    expect(html).toContain("MLOps");
    expect(html).toContain("alice");
    expect(html).toContain("2 members");
    expect(html).toContain("3 prompts");
  });

  it("shows an empty state when there are no projects", async () => {
    const html = renderToStaticMarkup(<ProjectsListView rows={[]} onNewProject={vi.fn()} />);

    expect(html).toContain("No projects yet");
    expect(html).toContain('role="status"');
    expect(html).toContain("New project");
    await expectNoCriticalOrSeriousAxeViolations(html);
  });
});
