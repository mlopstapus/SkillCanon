import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AssignProjectsDrawer } from "./assign-projects-drawer";

const assignments = [
  { projectId: "p1", projectName: "Eval Harness", requirement: "required" as const },
  { projectId: "p2", projectName: "Brand Voice", requirement: null },
];

describe("AssignProjectsDrawer", () => {
  it("renders every project with None/Optional/Required controls", () => {
    const html = renderToStaticMarkup(
      <AssignProjectsDrawer
        promptName="code-review-strict"
        assignments={assignments}
        onSetRequirement={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain("Assign code-review-strict to projects");
    expect(html).toContain("Eval Harness");
    expect(html).toContain("Brand Voice");
    expect(html).toContain("Required");
    expect(html).toContain("Optional");
    expect(html).toContain("None");
  });
});
