// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expectNoCriticalOrSeriousAxeViolations } from "@/shared/testing/accessibility";
import { Drawer } from "./drawer";

const noop = () => {};
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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

  it("keeps focus stable across close-handler changes and uses the latest handler", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let firstCloseCount = 0;
    let latestCloseCount = 0;

    await act(async () => {
      root.render(
        <Drawer onClose={() => { firstCloseCount += 1; }} labelledBy="drawer-title">
          <span id="drawer-title">Transfer ownership</span>
          <button type="button">First action</button>
          <input aria-label="Candidate search" />
        </Drawer>,
      );
    });
    const searchInput = container.querySelector<HTMLInputElement>('input[aria-label="Candidate search"]');
    searchInput?.focus();

    await act(async () => {
      root.render(
        <Drawer onClose={() => { latestCloseCount += 1; }} labelledBy="drawer-title">
          <span id="drawer-title">Transfer ownership</span>
          <button type="button">First action</button>
          <input aria-label="Candidate search" />
        </Drawer>,
      );
    });
    const focusStayedOnSearch = document.activeElement === searchInput;
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    await act(async () => root.unmount());
    container.remove();

    expect(focusStayedOnSearch).toBe(true);
    expect(firstCloseCount).toBe(0);
    expect(latestCloseCount).toBe(1);
  });

  it("initially focuses a visible control rather than a class-hidden candidate", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Drawer onClose={noop} labelledBy="drawer-title">
          <span id="drawer-title">Transfer ownership</span>
          <div className="hidden">
            <button type="button">Hidden candidate</button>
          </div>
          <input aria-label="Visible search" />
        </Drawer>,
      );
    });
    const visibleSearch = container.querySelector<HTMLInputElement>('input[aria-label="Visible search"]');
    const focusedElement = document.activeElement;

    await act(async () => root.unmount());
    container.remove();

    expect(focusedElement).toBe(visibleSearch);
  });

  it("keeps Tab inside the dialog when no visible controls are enabled", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Drawer onClose={noop} labelledBy="drawer-title">
          <span id="drawer-title">Transfer ownership</span>
          <p role="status" tabIndex={-1}>Transferring ownership…</p>
          <button type="button" disabled>Cancel</button>
        </Drawer>,
      );
    });
    const status = container.querySelector<HTMLElement>('[role="status"]');
    status?.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    await act(async () => {
      document.dispatchEvent(tab);
    });

    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(status);

    await act(async () => root.unmount());
    container.remove();
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
