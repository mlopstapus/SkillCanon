import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AddSkillDrawer } from "./add-skill-drawer";

describe("AddSkillDrawer", () => {
  it("lists addable skills with an Add button", () => {
    const html = renderToStaticMarkup(
      <AddSkillDrawer
        addableSkills={[{ id: "s1", name: "release-notes", description: "Notes", personal: true }]}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("release-notes");
    expect(html).toContain("Add");
  });

  it("shows an empty state", () => {
    const html = renderToStaticMarkup(<AddSkillDrawer addableSkills={[]} onAdd={vi.fn()} onClose={vi.fn()} />);
    expect(html).toContain("No more skills available");
  });
});
