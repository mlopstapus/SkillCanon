import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ObjectiveDrawer } from "./objective-drawer";

describe("ObjectiveDrawer", () => {
  it("renders create mode with name and content fields, no enforcement/priority", () => {
    const html = renderToStaticMarkup(
      <ObjectiveDrawer
        scopeLabel="alice"
        scopeKind="team"
        mode="create"
        onClose={() => {}}
        onSubmit={async () => ({ ok: true })}
      />,
    );
    expect(html).toContain("New objective");
    expect(html).toContain("Create objective");
    expect(html).not.toContain("Enforcement");
    expect(html).not.toContain("Priority");
  });

  it("renders edit mode pre-filled with initial values", () => {
    const html = renderToStaticMarkup(
      <ObjectiveDrawer
        scopeLabel="alice"
        scopeKind="team"
        mode="edit"
        initialValues={{ title: "reduce-inference-cost", description: "Lower cost 15%." }}
        onClose={() => {}}
        onSubmit={async () => ({ ok: true })}
      />,
    );
    expect(html).toContain("Edit objective");
    expect(html).toContain("reduce-inference-cost");
    expect(html).toContain("Lower cost 15%.");
    expect(html).toContain("Save changes");
  });

  it("works at a team scope, describing cascading inherited guidance", () => {
    const html = renderToStaticMarkup(
      <ObjectiveDrawer
        scopeLabel="Platform"
        scopeKind="team"
        mode="create"
        onClose={() => {}}
        onSubmit={async () => ({ ok: true })}
      />,
    );
    expect(html).toContain("at Platform");
    expect(html).toContain("cascades to");
  });

  it("works at a person scope, describing non-cascading guidance for just that person", () => {
    const html = renderToStaticMarkup(
      <ObjectiveDrawer
        scopeLabel="bob"
        scopeKind="person"
        mode="create"
        onClose={() => {}}
        onSubmit={async () => ({ ok: true })}
      />,
    );
    expect(html).toContain("at bob");
    expect(html).toContain("for");
    expect(html).toContain("bob");
    expect(html).toContain("does not cascade");
  });

  it("works at a project scope, describing non-cascading guidance for just that project", () => {
    const html = renderToStaticMarkup(
      <ObjectiveDrawer
        scopeLabel="Eval Harness"
        scopeKind="project"
        mode="create"
        onClose={() => {}}
        onSubmit={async () => ({ ok: true })}
      />,
    );
    expect(html).toContain("at Eval Harness");
    expect(html).toContain("Eval Harness");
    expect(html).toContain("does not cascade");
  });
});
