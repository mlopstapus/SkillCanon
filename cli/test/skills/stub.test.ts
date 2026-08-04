import { describe, expect, it } from "vitest";
import { deriveSlug, parseStub, renderStub } from "../../src/skills/stub.js";

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

describe("renderStub / parseStub", () => {
  it("round-trips name and description through frontmatter", () => {
    const content = renderStub({ slug: "release-notes", name: "Release Notes", description: "Drafts release notes." });
    const parsed = parseStub(content);
    expect(parsed).toEqual({ name: "Release Notes", description: "Drafts release notes." });
  });

  it("body instructs running `skillcanon run <slug>`", () => {
    const content = renderStub({ slug: "release-notes", name: "Release Notes", description: "Drafts release notes." });
    expect(content).toContain("skillcanon run release-notes");
  });

  it("is byte-for-byte identical across two renders of the same input (stable for hashing)", () => {
    const a = renderStub({ slug: "x", name: "X", description: "Y" });
    const b = renderStub({ slug: "x", name: "X", description: "Y" });
    expect(a).toBe(b);
  });
});
