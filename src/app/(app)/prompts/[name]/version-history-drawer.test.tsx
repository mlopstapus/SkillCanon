import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VersionHistoryDrawer } from "./version-history-drawer";

const versions = [
  { id: "v2", version: "v2", createdAt: "2026-07-10", tags: ["git"], isActive: true, systemTemplate: "sys v2" },
  { id: "v1", version: "v1", createdAt: "2026-06-02", tags: [], isActive: false, systemTemplate: "sys v1" },
];

describe("VersionHistoryDrawer", () => {
  it("renders every version with its active state and a Set active action for inactive ones", () => {
    const html = renderToStaticMarkup(
      <VersionHistoryDrawer versions={versions} onClose={vi.fn()} onSetActive={vi.fn()} />,
    );

    expect(html).toContain("v2");
    expect(html).toContain("v1");
    expect(html).toContain("active");
    expect(html).toContain("Set active");
  });
});
