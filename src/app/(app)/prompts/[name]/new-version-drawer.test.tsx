import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NewVersionDrawer } from "./new-version-drawer";

describe("NewVersionDrawer", () => {
  it("renders the next-version banner, a file-bundle editor pre-filled from the active version, and tags", () => {
    const html = renderToStaticMarkup(
      <NewVersionDrawer
        promptName="commit-message"
        nextVersionLabel="v3"
        mainFileContent="You write terse commits."
        supportingFiles={[{ name: "example.md", content: "An example." }]}
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
    expect(html).toContain("SKILL.md");
    expect(html).toContain("You write terse commits.");
    expect(html).toContain("example.md");
    expect(html).toContain("git, conventional");
    expect(html).toContain("Set as active version immediately");
    expect(html).toContain("Publish version");
    expect(html).toContain("Chain");
    expect(html).not.toContain("System template");
    expect(html).not.toContain("User template");
  });

  it("prefills the step builder and hides the file editor when the active version is itself a chain", () => {
    const html = renderToStaticMarkup(
      <NewVersionDrawer
        promptName="incident-response-chain"
        nextVersionLabel="v2"
        mainFileContent=""
        supportingFiles={[]}
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
    expect(html).not.toContain("SKILL.md");
  });
});
