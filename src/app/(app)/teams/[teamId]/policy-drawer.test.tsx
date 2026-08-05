import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PolicyDrawer } from "./policy-drawer";

describe("PolicyDrawer", () => {
  it("renders create mode with all four enforcement options", () => {
    const html = renderToStaticMarkup(
      <PolicyDrawer scopeLabel="Platform" mode="create" onClose={() => {}} onSubmit={async () => ({ ok: true })} />,
    );
    expect(html).toContain("New policy");
    expect(html).toContain(">prepend<");
    expect(html).toContain(">append<");
    expect(html).toContain(">inject<");
    expect(html).toContain(">validate<");
    expect(html).toContain("Create policy");
  });

  it("renders edit mode pre-filled with initial values", () => {
    const html = renderToStaticMarkup(
      <PolicyDrawer
        scopeLabel="Platform"
        mode="edit"
        initialValues={{ name: "pin-model-version", enforcementType: "inject", priority: 40, content: "Pin it." }}
        onClose={() => {}}
        onSubmit={async () => ({ ok: true })}
      />,
    );
    expect(html).toContain("Edit policy");
    expect(html).toContain("pin-model-version");
    expect(html).toContain("Pin it.");
    expect(html).toContain("Save changes");
  });

  it("shows the scope-cascade info callout naming the current scope", () => {
    const html = renderToStaticMarkup(
      <PolicyDrawer scopeLabel="Engineering" mode="create" onClose={() => {}} onSubmit={async () => ({ ok: true })} />,
    );
    expect(html).toContain("at Engineering");
    expect(html).toContain("cascades to all");
  });
});
