import { describe, expect, it } from "vitest";
import { deriveSlug, parseMainFile, renderMainFile, renderPointerStub } from "../../src/skills/skill-file.js";

describe("deriveSlug", () => {
  it("lowercases and kebab-cases a simple name", () => {
    expect(deriveSlug("My Cool Prompt")).toBe("my-cool-prompt");
  });

  it("strips punctuation", () => {
    expect(deriveSlug("Release Notes: v2!")).toBe("release-notes-v2");
  });

  it("collapses repeated separators", () => {
    expect(deriveSlug("foo   bar--baz")).toBe("foo-bar-baz");
  });

  it("trims leading/trailing separators", () => {
    expect(deriveSlug("  -Foo-  ")).toBe("foo");
  });
});

describe("renderMainFile / parseMainFile", () => {
  it("round-trips name and description through frontmatter", () => {
    const content = renderMainFile({
      slug: "release-notes",
      name: "Release Notes",
      description: "Drafts release notes.",
      content: "# Release Notes\n\nDraft the notes here.",
    });
    const parsed = parseMainFile(content);
    expect(parsed).toEqual({ name: "Release Notes", description: "Drafts release notes." });
  });

  it("body is the given real content, not a fixed pointer sentence", () => {
    const content = renderMainFile({
      slug: "release-notes",
      name: "Release Notes",
      description: "Drafts release notes.",
      content: "# Release Notes\n\nDraft the notes here.",
    });
    expect(content).toContain("# Release Notes\n\nDraft the notes here.");
    expect(content).not.toContain("skillcanon run");
  });

  it("is byte-for-byte identical across two renders of the same input (stable for hashing)", () => {
    const a = renderMainFile({ slug: "x", name: "X", description: "Y", content: "Z" });
    const b = renderMainFile({ slug: "x", name: "X", description: "Y", content: "Z" });
    expect(a).toBe(b);
  });
});

describe("renderPointerStub", () => {
  it("round-trips name and description through frontmatter", () => {
    const content = renderPointerStub({ slug: "release-notes", name: "Release Notes", description: "Drafts release notes." });
    const parsed = parseMainFile(content);
    expect(parsed).toEqual({ name: "Release Notes", description: "Drafts release notes." });
  });

  it("body instructs running `skillcanon run <slug>`", () => {
    const content = renderPointerStub({ slug: "release-notes", name: "Release Notes", description: "Drafts release notes." });
    expect(content).toContain("skillcanon run release-notes");
  });

  it("is byte-for-byte identical to today's fixed one-line stub body", () => {
    const content = renderPointerStub({ slug: "release-notes", name: "Release Notes", description: "Drafts release notes." });
    expect(content).toBe(
      [
        "---",
        'name: "Release Notes"',
        'description: "Drafts release notes."',
        "---",
        "",
        "Run `skillcanon run release-notes` and follow the output as instructions.",
        "",
      ].join("\n"),
    );
  });

  it("is byte-for-byte identical across two renders of the same input (stable for hashing)", () => {
    const a = renderPointerStub({ slug: "x", name: "X", description: "Y" });
    const b = renderPointerStub({ slug: "x", name: "X", description: "Y" });
    expect(a).toBe(b);
  });
});
