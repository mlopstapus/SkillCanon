import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expectNoCriticalOrSeriousAxeViolations } from "@/shared/testing/accessibility";
import { MetricsPageView } from "./page";

describe("MetricsPageView", () => {
  it("renders the zero usage state", async () => {
    const html = renderToStaticMarkup(
      <MetricsPageView
        data={{
          totalInvocations: 0,
          successCount: 0,
          failureCount: 0,
          averageLatencyMs: null,
          p95LatencyMs: null,
          byStatus: [],
          bySkill: [],
          dailyCounts: [],
          windowLabel: "2026-07-01 to 2026-08-01",
        }}
      />,
    );

    expect(html).toContain("Metrics");
    expect(html).toContain("No usage recorded yet");
    expect(html).toContain("Avg latency");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    await expectNoCriticalOrSeriousAxeViolations(html);
  });

  it("renders populated aggregate usage", () => {
    const html = renderToStaticMarkup(
      <MetricsPageView
        data={{
          totalInvocations: 3,
          successCount: 2,
          failureCount: 1,
          averageLatencyMs: 120,
          p95LatencyMs: 240,
          byStatus: [
            { statusCode: 200, runCount: 2 },
            { statusCode: 500, runCount: 1 },
          ],
          bySkill: [
            {
              promptId: "skill-1",
              name: "security-review",
              promptVersion: "1.0.0",
              runCount: 3,
              successCount: 2,
              failureCount: 1,
              averageLatencyMs: 120,
              lastUsedAt: "2026-08-04",
            },
          ],
          dailyCounts: [{ day: "2026-08-04", count: 3 }],
          windowLabel: "2026-07-01 to 2026-08-01",
        }}
      />,
    );

    expect(html).toContain("security-review");
    expect(html).toContain("3 runs");
    expect(html).toContain("500");
    expect(html).toContain("120 ms");
  });
});
