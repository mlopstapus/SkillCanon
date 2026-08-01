import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AddMemberDrawer } from "./add-member-drawer";

describe("AddMemberDrawer", () => {
  it("renders addable users with an Add action", () => {
    const html = renderToStaticMarkup(
      <AddMemberDrawer addableUsers={[{ id: "u1", name: "dave" }]} onAdd={vi.fn()} onClose={vi.fn()} />,
    );
    expect(html).toContain("dave");
    expect(html).toContain("Add");
  });
});
