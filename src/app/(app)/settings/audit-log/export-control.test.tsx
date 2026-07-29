import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExportControl } from "./export-control";

describe("ExportControl", () => {
  it("renders nothing when no entitlement context exists (today's actual state)", () => {
    const markup = renderToStaticMarkup(<ExportControl />);
    expect(markup).toBe("");
  });

  it("renders a disabled control with an upgrade explanation when explicitly not entitled", () => {
    const markup = renderToStaticMarkup(<ExportControl canExport={false} />);
    expect(markup).toContain("Export");
    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain("audit export enabled");
  });

  it("renders an enabled control when entitled", () => {
    const markup = renderToStaticMarkup(<ExportControl canExport={true} />);
    expect(markup).toContain("Export");
    expect(markup).not.toContain("disabled");
  });
});
