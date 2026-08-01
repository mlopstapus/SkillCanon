import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AddRepoDrawer } from "./add-repo-drawer";

describe("AddRepoDrawer", () => {
  it("renders name, url, and branch fields", () => {
    const html = renderToStaticMarkup(
      <AddRepoDrawer onClose={vi.fn()} onSubmit={vi.fn().mockResolvedValue({ ok: true })} />,
    );
    expect(html).toContain("Add repository");
    expect(html).toContain("Repository URL");
    expect(html).toContain("Branch");
  });
});
