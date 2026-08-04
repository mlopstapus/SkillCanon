import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NewVersionDrawer } from "./new-version-drawer";

describe("NewVersionDrawer", () => {
  it("renders the next-version banner and pre-fills templates/tags from the active version", () => {
    const html = renderToStaticMarkup(
      <NewVersionDrawer
        promptName="commit-message"
        nextVersionLabel="v3"
        systemTemplate="You write terse commits."
        userTemplate="Diff:\n{{ diff }}"
        tags={["git", "conventional"]}
        activeVersionKind="template"
        activeVersionSteps={[]}
        accessibleSkillNames={["commit-message", "summarize"]}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );

    expect(html).toContain("New version of commit-message");
    expect(html).toContain("v3");
    expect(html).toContain("You write terse commits.");
    expect(html).toContain("git, conventional");
    expect(html).toContain("Set as active version immediately");
    expect(html).toContain("Publish version");
    expect(html).toContain("Chain");
  });

  it("prefills the step builder and hides template fields when the active version is itself a chain", () => {
    const html = renderToStaticMarkup(
      <NewVersionDrawer
        promptName="incident-response-chain"
        nextVersionLabel="v2"
        systemTemplate=""
        userTemplate=""
        tags={["ops"]}
        activeVersionKind="chain"
        activeVersionSteps={[
          { id: "step-1", promptName: "summarize", promptVersion: "", dependsOn: [] },
          { id: "step-2", promptName: "draft-reply", promptVersion: "v2", dependsOn: ["step-1"] },
        ]}
        accessibleSkillNames={["summarize", "draft-reply"]}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );

    expect(html).toContain("summarize");
    expect(html).toContain("draft-reply");
    expect(html).not.toContain("System template");
    expect(html).not.toContain("User template");
  });
});
