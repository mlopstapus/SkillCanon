import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VersionHistoryDrawer } from "./version-history-drawer";

const versions = [
  {
    id: "v2",
    version: "v2",
    createdAt: "2026-07-10",
    tags: ["git"],
    isActive: true,
    kind: "template" as const,
    systemTemplate: "sys v2",
    stepCount: 0,
  },
  {
    id: "v1",
    version: "v1",
    createdAt: "2026-06-02",
    tags: [],
    isActive: false,
    kind: "template" as const,
    systemTemplate: "sys v1",
    stepCount: 0,
  },
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

  it("shows a step count instead of a blank template preview for a chain-kind version", () => {
    const chainVersions = [
      {
        id: "c1",
        version: "v1",
        createdAt: "2026-07-20",
        tags: ["chain"],
        isActive: true,
        kind: "chain" as const,
        systemTemplate: null,
        stepCount: 3,
      },
    ];
    const html = renderToStaticMarkup(
      <VersionHistoryDrawer versions={chainVersions} onClose={vi.fn()} onSetActive={vi.fn()} />,
    );
    expect(html).toContain("3 steps");
  });
});
