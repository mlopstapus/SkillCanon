import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AddTeamDrawer } from "./add-team-drawer";

describe("AddTeamDrawer", () => {
  it("renders addable teams with an Add action", () => {
    const html = renderToStaticMarkup(
      <AddTeamDrawer addableTeams={[{ id: "t1", name: "Platform" }]} onAdd={vi.fn()} onClose={vi.fn()} />,
    );
    expect(html).toContain("Platform");
    expect(html).toContain("Add");
  });

  it("shows a message when every team already participates", () => {
    const html = renderToStaticMarkup(<AddTeamDrawer addableTeams={[]} onAdd={vi.fn()} onClose={vi.fn()} />);
    expect(html).toContain("Every team is already on this project.");
  });
});
