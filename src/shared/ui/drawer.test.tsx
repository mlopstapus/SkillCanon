import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expectNoCriticalOrSeriousAxeViolations } from "@/shared/testing/accessibility";
import { Drawer } from "./drawer";

const noop = () => {};

describe("Drawer", () => {
  it("renders dialog semantics wired to the caller's own title element", () => {
    const html = renderToStaticMarkup(
      <Drawer onClose={noop} labelledBy="my-title">
        <div>
          <span id="my-title">Issue API key</span>
        </div>
      </Drawer>,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="my-title"');
    expect(html).toContain("Issue API key");
  });

  it("keeps the backdrop decorative and separate from the dialog panel", () => {
    const html = renderToStaticMarkup(
      <Drawer onClose={noop} labelledBy="my-title">
        <span id="my-title">New team</span>
      </Drawer>,
    );

    expect(html).toContain('aria-hidden="true"');
  });

  it("applies a custom panel width when provided", () => {
    const html = renderToStaticMarkup(
      <Drawer onClose={noop} labelledBy="my-title" widthClassName="w-[520px]">
        <span id="my-title">Event detail</span>
      </Drawer>,
    );

    expect(html).toContain("w-[520px]");
  });

  it("has no critical or serious axe violations", async () => {
    const html = renderToStaticMarkup(
      <Drawer onClose={noop} labelledBy="my-title">
        <div>
          <span id="my-title">Issue API key</span>
          <button type="button" aria-label="Close">
            ×
          </button>
        </div>
      </Drawer>,
    );

    await expectNoCriticalOrSeriousAxeViolations(html);
  });
});
