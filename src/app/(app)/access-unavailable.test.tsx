import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expectNoCriticalOrSeriousAxeViolations } from "@/shared/testing/accessibility";
import { AccessUnavailable } from "./access-unavailable";

describe("AccessUnavailable", () => {
  it("renders the canonical error state", async () => {
    const markup = renderToStaticMarkup(<AccessUnavailable />);

    expect(markup).toContain("This workspace is not enabled");
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-live="polite"');
    await expectNoCriticalOrSeriousAxeViolations(markup);
  });
});
