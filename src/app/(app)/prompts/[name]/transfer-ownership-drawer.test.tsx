// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TransferOwnershipDrawer } from "./transfer-ownership-drawer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const candidates = {
  users: [
    { id: "u2", name: "Bob Builder" },
    { id: "u3", name: "Carol Reviewer" },
  ],
  teams: [
    { id: "t2", name: "Platform" },
    { id: "t3", name: "Security" },
  ],
};

describe("TransferOwnershipDrawer", () => {
  it("uses a pressed-button mode group and keeps both labelled candidate regions mounted", () => {
    const html = renderToStaticMarkup(
      <TransferOwnershipDrawer
        promptName="commit-message"
        currentOwnerLabel="Alice Admin"
        candidates={candidates}
        onClose={vi.fn()}
        onConfirm={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="New owner type"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
    expect(html.match(/role="region"/g)).toHaveLength(2);
    expect(html).not.toMatch(/role="tab(list|panel)?"/);
    expect(html).toContain("Bob Builder");
    expect(html).toContain("Carol Reviewer");
    expect(html).toContain("Platform");
    expect(html).toContain("Security");
    expect(html).toMatch(/role="region"[^>]*class="[^"]*hidden/);
  });

  it("confirms the selected owner with dynamic warning copy, submits that owner, and closes on success", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let confirmed: { newOwnerType: "user" | "team"; newOwnerId: string } | null = null;
    let closeCount = 0;

    await act(async () => {
      root.render(
        <TransferOwnershipDrawer
          promptName="commit-message"
          currentOwnerLabel="Alice Admin"
          candidates={candidates}
          onClose={() => {
            closeCount += 1;
          }}
          onConfirm={async (params) => {
            confirmed = params;
            return { ok: true };
          }}
        />,
      );
    });

    const bobButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Bob Builder",
    );
    await act(async () => bobButton?.click());

    const emphasizedValues = [...container.querySelectorAll("strong")].map((node) => node.textContent);
    expect(emphasizedValues).toEqual(["commit-message", "Alice Admin", "Bob Builder"]);
    expect(container.textContent).toContain("may lose access unless otherwise subscribed");

    const confirmButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Transfer ownership",
    );
    await act(async () => confirmButton?.click());

    expect(confirmed).toEqual({ newOwnerType: "user", newOwnerId: "u2" });
    expect(closeCount).toBe(1);

    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the drawer open and shows the action error when transfer fails", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let closeCount = 0;

    await act(async () => {
      root.render(
        <TransferOwnershipDrawer
          promptName="commit-message"
          currentOwnerLabel="Alice Admin"
          candidates={candidates}
          onClose={() => {
            closeCount += 1;
          }}
          onConfirm={async () => ({ ok: false, error: "Destination is no longer available." })}
        />,
      );
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Bob Builder")?.click();
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Transfer ownership")
        ?.click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Destination is no longer available.",
    );
    expect(closeCount).toBe(0);

    await act(async () => root.unmount());
    container.remove();
  });

  it("returns from confirmation to the picker without submitting or closing", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let submitCount = 0;
    let closeCount = 0;

    await act(async () => {
      root.render(
        <TransferOwnershipDrawer
          promptName="commit-message"
          currentOwnerLabel="Alice Admin"
          candidates={candidates}
          onClose={() => {
            closeCount += 1;
          }}
          onConfirm={async () => {
            submitCount += 1;
            return { ok: true };
          }}
        />,
      );
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Bob Builder")?.click();
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Back")?.click();
    });

    expect(
      [...container.querySelectorAll("button")].some(
        (button) => button.textContent === "Transfer ownership",
      ),
    ).toBe(false);
    expect(container.querySelector('[role="group"]')?.parentElement?.className).not.toContain("hidden");
    expect(submitCount).toBe(0);
    expect(closeCount).toBe(0);

    await act(async () => root.unmount());
    container.remove();
  });

  it("cancels without submitting", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let submitCount = 0;
    let closeCount = 0;

    await act(async () => {
      root.render(
        <TransferOwnershipDrawer
          promptName="commit-message"
          currentOwnerLabel="Alice Admin"
          candidates={candidates}
          onClose={() => {
            closeCount += 1;
          }}
          onConfirm={async () => {
            submitCount += 1;
            return { ok: true };
          }}
        />,
      );
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Cancel")?.click();
    });

    expect(closeCount).toBe(1);
    expect(submitCount).toBe(0);

    await act(async () => root.unmount());
    container.remove();
  });

  it("disables confirmation controls and shows pending copy until the action succeeds", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let resolveTransfer: ((result: { ok: true }) => void) | undefined;
    let closeCount = 0;

    await act(async () => {
      root.render(
        <TransferOwnershipDrawer
          promptName="commit-message"
          currentOwnerLabel="Alice Admin"
          candidates={candidates}
          onClose={() => {
            closeCount += 1;
          }}
          onConfirm={() =>
            new Promise<{ ok: true }>((resolve) => {
              resolveTransfer = resolve;
            })
          }
        />,
      );
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Bob Builder")?.click();
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Transfer ownership")
        ?.click();
      await Promise.resolve();
    });

    const pendingButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Transferring…",
    );
    expect(pendingButton?.disabled).toBe(true);
    expect(
      [...container.querySelectorAll("button")]
        .filter((button) => button.textContent === "Back" || button.textContent === "Cancel")
        .every((button) => button.disabled),
    ).toBe(true);
    const closeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    await act(async () => {
      closeButton?.click();
      container.querySelector<HTMLElement>('[aria-hidden="true"]')?.click();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(closeCount).toBe(0);
    expect(closeButton?.disabled).toBe(true);

    await act(async () => {
      resolveTransfer?.({ ok: true });
    });
    expect(closeCount).toBe(1);

    await act(async () => root.unmount());
    container.remove();
  });

  it("submits the selected team as a team owner", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let confirmed: { newOwnerType: "user" | "team"; newOwnerId: string } | null = null;

    await act(async () => {
      root.render(
        <TransferOwnershipDrawer
          promptName="commit-message"
          currentOwnerLabel="Alice Admin"
          candidates={candidates}
          onClose={() => {}}
          onConfirm={async (params) => {
            confirmed = params;
            return { ok: true };
          }}
        />,
      );
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Teams")?.click();
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Security")?.click();
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Transfer ownership")
        ?.click();
    });

    expect(confirmed).toEqual({ newOwnerType: "team", newOwnerId: "t3" });

    await act(async () => root.unmount());
    container.remove();
  });

  it("filters transfer candidates by a case-insensitive search", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TransferOwnershipDrawer
          promptName="commit-message"
          currentOwnerLabel="Alice Admin"
          candidates={candidates}
          onClose={() => {}}
          onConfirm={async () => ({ ok: true })}
        />,
      );
    });
    const search = container.querySelector<HTMLInputElement>('[aria-label="Search transfer candidates"]');
    await act(async () => {
      if (!search) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "CAROL");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const candidateLabels = [...container.querySelectorAll('[role="region"] button')].map(
      (button) => button.textContent,
    );
    expect(candidateLabels).toEqual(["Carol Reviewer"]);

    await act(async () => root.unmount());
    container.remove();
  });
});
