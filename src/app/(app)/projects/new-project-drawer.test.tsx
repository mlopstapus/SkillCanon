import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NewProjectDrawer } from "./new-project-drawer";

describe("NewProjectDrawer", () => {
  it("renders name, team, lead, and description fields", () => {
    const html = renderToStaticMarkup(
      <NewProjectDrawer
        teamOptions={[{ id: "t1", name: "MLOps" }]}
        userOptions={[{ id: "u1", name: "alice" }]}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );

    expect(html).toContain("New project");
    expect(html).toContain("MLOps");
    expect(html).toContain("alice");
    expect(html).toContain("Create project");
  });
});
