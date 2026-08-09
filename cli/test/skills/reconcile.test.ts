import { describe, expect, it } from "vitest";
import { planReconciliation, type RosterEntry } from "../../src/skills/reconcile.js";
import { hashContent } from "../../src/config/sync-manifest.js";

function pointerStubEntry(name: string, description: string | null = null): RosterEntry {
  return { skill: { name, description, activeVersionId: "v1" }, content: { shape: "pointer-stub" } };
}

function filesEntry(
  name: string,
  mainContent: string,
  supportingFiles: Array<{ name: string; content: string }> = [],
  description: string | null = null,
): RosterEntry {
  return {
    skill: { name, description, activeVersionId: "v1" },
    content: { shape: "files", mainFile: { content: mainContent }, supportingFiles },
  };
}

describe("planReconciliation (no conflicts, pointer-stub shape)", () => {
  it("creates SKILL.md for a prompt not yet tracked", () => {
    const plan = planReconciliation([pointerStubEntry("Release Notes", "Drafts release notes.")]);
    expect(plan.actions).toEqual([
      {
        type: "create",
        slug: "release-notes",
        filename: "SKILL.md",
        content: "Run `skillcanon run release-notes` and follow the output as instructions.",
        frontmatter: { name: "Release Notes", description: "Drafts release notes." },
      },
    ]);
  });

  it("updates SKILL.md whose slug is already tracked", () => {
    const plan = planReconciliation([pointerStubEntry("Release Notes", "New description.")], {
      lastWrittenHashBySlugAndFile: { "release-notes": { "SKILL.md": "irrelevant-old-hash" } },
      getCurrentFileContent: () => undefined,
    });
    expect(plan.actions).toEqual([
      {
        type: "update",
        slug: "release-notes",
        filename: "SKILL.md",
        content: "Run `skillcanon run release-notes` and follow the output as instructions.",
        frontmatter: { name: "Release Notes", description: "New description." },
      },
    ]);
  });

  it("removes every tracked file for a skill no longer in the roster", () => {
    const plan = planReconciliation([], {
      lastWrittenHashBySlugAndFile: { "release-notes": { "SKILL.md": "h1" } },
    });
    expect(plan.actions).toEqual([{ type: "remove", slug: "release-notes", filename: "SKILL.md" }]);
  });

  it("handles a null description as an empty string", () => {
    const plan = planReconciliation([pointerStubEntry("X", null)]);
    expect(plan.actions[0]).toMatchObject({ frontmatter: { description: "" } });
  });
});

describe("planReconciliation (files shape, US1)", () => {
  it("creates one action per file: main file (with frontmatter) plus each supporting file (without)", () => {
    const plan = planReconciliation([filesEntry("Release Notes", "Body.", [{ name: "example.md", content: "Ex." }], "Desc.")]);
    expect(plan.actions).toContainEqual({
      type: "create",
      slug: "release-notes",
      filename: "SKILL.md",
      content: "Body.",
      frontmatter: { name: "Release Notes", description: "Desc." },
    });
    expect(plan.actions).toContainEqual({
      type: "create",
      slug: "release-notes",
      filename: "example.md",
      content: "Ex.",
    });
  });

  it("removes a previously-tracked supporting file no longer in the desired file set (FR-006)", () => {
    const plan = planReconciliation([filesEntry("Release Notes", "Body.")], {
      lastWrittenHashBySlugAndFile: {
        "release-notes": { "SKILL.md": hashContent("Body."), "example.md": hashContent("Ex.") },
      },
      getCurrentFileContent: (_slug, filename) => (filename === "example.md" ? "Ex." : "Body."),
    });
    expect(plan.actions).toContainEqual({ type: "remove", slug: "release-notes", filename: "example.md" });
  });
});

describe("planReconciliation (hand-edit conflicts, FR-010/FR-010a, US2)", () => {
  it("T015: flags a hand-edited supporting file as a conflict while an unedited SKILL.md in the same folder still updates normally", () => {
    const trackedMainContent = "Body.";
    const trackedExampleContent = "original example content";
    const plan = planReconciliation(
      [filesEntry("Release Notes", trackedMainContent, [{ name: "example.md", content: "new example content" }], "Desc.")],
      {
        lastWrittenHashBySlugAndFile: {
          "release-notes": { "SKILL.md": hashContent(trackedMainContent), "example.md": hashContent(trackedExampleContent) },
        },
        getCurrentFileContent: (_slug, filename) =>
          filename === "example.md" ? "hand-edited example content" : trackedMainContent,
      },
    );

    expect(plan.actions).toContainEqual({ type: "conflict", slug: "release-notes", filename: "example.md", reason: "hand-edited" });
    expect(plan.actions).toContainEqual({
      type: "update",
      slug: "release-notes",
      filename: "SKILL.md",
      content: trackedMainContent,
      frontmatter: { name: "Release Notes", description: "Desc." },
    });
  });

  it("T016: --force (force: true) bypasses a hand-edit conflict", () => {
    const lastHash = hashContent("original content");
    const plan = planReconciliation([pointerStubEntry("Release Notes", "Drafts release notes.")], {
      lastWrittenHashBySlugAndFile: { "release-notes": { "SKILL.md": lastHash } },
      getCurrentFileContent: () => "hand-edited content",
      force: true,
    });
    expect(plan.actions).toEqual([
      {
        type: "update",
        slug: "release-notes",
        filename: "SKILL.md",
        content: "Run `skillcanon run release-notes` and follow the output as instructions.",
        frontmatter: { name: "Release Notes", description: "Drafts release notes." },
      },
    ]);
  });

  it("T017: treats a deleted (not hand-edited) tracked file as needing recreation, not a conflict", () => {
    const lastHash = hashContent("original content");
    const plan = planReconciliation([pointerStubEntry("Release Notes", "Drafts release notes.")], {
      lastWrittenHashBySlugAndFile: { "release-notes": { "SKILL.md": lastHash } },
      getCurrentFileContent: () => undefined,
    });
    expect(plan.actions).toEqual([
      {
        type: "update",
        slug: "release-notes",
        filename: "SKILL.md",
        content: "Run `skillcanon run release-notes` and follow the output as instructions.",
        frontmatter: { name: "Release Notes", description: "Drafts release notes." },
      },
    ]);
  });

  it("a hand-edit conflict on one skill does not block another skill from reconciling normally in the same run", () => {
    const lastHash = hashContent("original content");
    const plan = planReconciliation([pointerStubEntry("Release Notes"), pointerStubEntry("Other Prompt")], {
      lastWrittenHashBySlugAndFile: { "release-notes": { "SKILL.md": lastHash } },
      getCurrentFileContent: (slug) => (slug === "release-notes" ? "hand-edited content" : undefined),
    });
    expect(plan.actions).toContainEqual({ type: "conflict", slug: "release-notes", filename: "SKILL.md", reason: "hand-edited" });
    expect(plan.actions).toContainEqual(expect.objectContaining({ type: "create", slug: "other-prompt" }));
  });

  it("a hand-edited orphaned file is left in place and reported as a conflict instead of being removed (research.md §5)", () => {
    const trackedExampleContent = "original example content";
    const plan = planReconciliation([filesEntry("Release Notes", "Body.")], {
      lastWrittenHashBySlugAndFile: {
        "release-notes": { "SKILL.md": hashContent("Body."), "example.md": hashContent(trackedExampleContent) },
      },
      getCurrentFileContent: (_slug, filename) => (filename === "example.md" ? "hand-edited orphan content" : "Body."),
    });
    expect(plan.actions).toContainEqual({ type: "conflict", slug: "release-notes", filename: "example.md", reason: "hand-edited" });
    expect(plan.actions).not.toContainEqual(expect.objectContaining({ type: "remove", filename: "example.md" }));
  });
});

describe("planReconciliation (slug-collision conflicts, FR-010a, FR-009)", () => {
  it("flags both prompts that derive the same slug, and writes neither", () => {
    const plan = planReconciliation([pointerStubEntry("Release Notes", "First."), pointerStubEntry("release notes", "Second.")]);
    expect(plan.actions).toEqual([{ type: "conflict", slug: "release-notes", reason: "slug-collision" }]);
  });

  it("a slug collision does not block an unrelated prompt from reconciling normally in the same run", () => {
    const plan = planReconciliation([
      pointerStubEntry("Release Notes", "First."),
      pointerStubEntry("release notes", "Second."),
      pointerStubEntry("Unrelated Prompt", "Fine."),
    ]);
    expect(plan.actions).toContainEqual({ type: "conflict", slug: "release-notes", reason: "slug-collision" });
    expect(plan.actions).toContainEqual(expect.objectContaining({ type: "create", slug: "unrelated-prompt" }));
  });

  it("--force does NOT bypass a slug-collision conflict", () => {
    const plan = planReconciliation(
      [pointerStubEntry("Release Notes", "First."), pointerStubEntry("release notes", "Second.")],
      { force: true },
    );
    expect(plan.actions).toEqual([{ type: "conflict", slug: "release-notes", reason: "slug-collision" }]);
  });
});
