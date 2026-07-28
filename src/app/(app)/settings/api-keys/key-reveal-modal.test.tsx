import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeyRevealModal } from "./key-reveal-modal";

const noop = () => {};

describe("KeyRevealModal", () => {
  it("shows the raw key once with a copy control and a won't-be-shown-again warning", () => {
    const markup = renderToStaticMarkup(
      <KeyRevealModal rawKey="sk_live_abcdef0123456789" onClose={noop} />,
    );

    expect(markup).toContain("sk_live_abcdef0123456789");
    expect(markup).toContain("Copy");
    expect(markup).toContain("won&#x27;t be shown again");
    expect(markup).toContain("done");
  });
});
