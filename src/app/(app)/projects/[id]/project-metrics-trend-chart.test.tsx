import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectMetricsTrendChart } from "./project-metrics-trend-chart";

function makeTrend(overrides: Record<number, Record<string, number>> = {}) {
  const trend = [];
  for (let i = 0; i < 14; i++) {
    trend.push({ day: `2026-08-${String(i + 1).padStart(2, "0")}`, countsByPromptId: overrides[i] ?? {} });
  }
  return trend;
}

describe("ProjectMetricsTrendChart", () => {
  it("renders 14 day bars", () => {
    const html = renderToStaticMarkup(
      <ProjectMetricsTrendChart trend={makeTrend()} skills={[{ id: "s1", name: "skill-a" }]} />,
    );
    const dayContainerMatches = html.match(/flex-1 flex-col items-center/g) ?? [];
    expect(dayContainerMatches).toHaveLength(14);
  });

  it("renders an all-zero day as a present, zero-height bar rather than omitting it", () => {
    const trend = makeTrend({ 5: { s1: 3 } });
    const html = renderToStaticMarkup(
      <ProjectMetricsTrendChart trend={trend} skills={[{ id: "s1", name: "skill-a" }]} />,
    );
    expect(html).toContain('min-height:0px');
    const dayContainerMatches = html.match(/flex-1 flex-col items-center/g) ?? [];
    expect(dayContainerMatches).toHaveLength(14);
  });

  it("proportions segments according to input counts", () => {
    const trend = makeTrend({ 0: { s1: 1, s2: 3 } });
    const html = renderToStaticMarkup(
      <ProjectMetricsTrendChart trend={trend} skills={[{ id: "s1", name: "skill-a" }, { id: "s2", name: "skill-b" }]} />,
    );
    // s1 is 1/4 of the day's total (25%), s2 is 3/4 (75%)
    expect(html).toContain("height:25%");
    expect(html).toContain("height:75%");
  });
});
