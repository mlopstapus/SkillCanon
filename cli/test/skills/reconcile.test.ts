import { describe, expect, it } from "vitest";
import { planReconciliation } from "../../src/skills/reconcile.js";
import { hashContent } from "../../src/config/sync-manifest.js";

describe("planReconciliation (no conflicts)", () => {
  it("creates a stub for a prompt not yet tracked", () => {
    const plan = planReconciliation([{ name: "Release Notes", description: "Drafts release notes." }], []);
    expect(plan.actions).toEqual([
      { type: "create", slug: "release-notes", name: "Release Notes", description: "Drafts release notes." },
    ]);
  });

  it("updates a stub whose slug is already tracked", () => {
    const plan = planReconciliation(
      [{ name: "Release Notes", description: "New description." }],
      ["release-notes"],
    );
    expect(plan.actions).toEqual([
      { type: "update", slug: "release-notes", name: "Release Notes", description: "New description." },
    ]);
  });

  it("removes a tracked stub whose prompt is no longer in the roster", () => {
    const plan = planReconciliation([], ["release-notes"]);
    expect(plan.actions).toEqual([{ type: "remove", slug: "release-notes" }]);
  });

  it("handles a null description as an empty string", () => {
    const plan = planReconciliation([{ name: "X", description: null }], []);
    expect(plan.actions[0]).toMatchObject({ description: "" });
  });

  it("produces a combined create+update+remove plan in one pass", () => {
    const plan = planReconciliation(
      [
        { name: "New Prompt", description: "" },
        { name: "Existing Prompt", description: "Updated." },
      ],
      ["existing-prompt", "gone-prompt"],
    );
    expect(plan.actions).toContainEqual({ type: "create", slug: "new-prompt", name: "New Prompt", description: "" });
    expect(plan.actions).toContainEqual({
      type: "update",
      slug: "existing-prompt",
      name: "Existing Prompt",
      description: "Updated.",
    });
    expect(plan.actions).toContainEqual({ type: "remove", slug: "gone-prompt" });
  });
});

describe("planReconciliation (hand-edit conflicts, FR-010/FR-010a)", () => {
  it("flags a tracked stub whose on-disk content no longer matches its last-written hash, and does not touch it", () => {
    const lastHash = hashContent("original content");
    const plan = planReconciliation(
      [{ name: "Release Notes", description: "Drafts release notes." }],
      ["release-notes"],
      {
        lastWrittenHashBySlug: { "release-notes": lastHash },
        currentContentBySlug: new Map([["release-notes", "hand-edited content"]]),
      },
    );
    expect(plan.actions).toEqual([{ type: "conflict", slug: "release-notes", reason: "hand-edited" }]);
  });

  it("does not flag a tracked stub whose on-disk content still matches its last-written hash", () => {
    const lastHash = hashContent("unchanged content");
    const plan = planReconciliation(
      [{ name: "Release Notes", description: "Drafts release notes." }],
      ["release-notes"],
      {
        lastWrittenHashBySlug: { "release-notes": lastHash },
        currentContentBySlug: new Map([["release-notes", "unchanged content"]]),
      },
    );
    expect(plan.actions).toEqual([
      { type: "update", slug: "release-notes", name: "Release Notes", description: "Drafts release notes." },
    ]);
  });

  it("treats a deleted (not hand-edited) stub as needing recreation, not a conflict", () => {
    const lastHash = hashContent("original content");
    const plan = planReconciliation(
      [{ name: "Release Notes", description: "Drafts release notes." }],
      ["release-notes"],
      { lastWrittenHashBySlug: { "release-notes": lastHash }, currentContentBySlug: new Map([["release-notes", undefined]]) },
    );
    expect(plan.actions).toEqual([
      { type: "update", slug: "release-notes", name: "Release Notes", description: "Drafts release notes." },
    ]);
  });

  it("a hand-edit conflict on one prompt does not block other prompts from reconciling normally in the same run", () => {
    const lastHash = hashContent("original content");
    const plan = planReconciliation(
      [
        { name: "Release Notes", description: "Drafts release notes." },
        { name: "Other Prompt", description: "Something else." },
      ],
      ["release-notes"],
      {
        lastWrittenHashBySlug: { "release-notes": lastHash },
        currentContentBySlug: new Map([["release-notes", "hand-edited content"]]),
      },
    );
    expect(plan.actions).toContainEqual({ type: "conflict", slug: "release-notes", reason: "hand-edited" });
    expect(plan.actions).toContainEqual({
      type: "create",
      slug: "other-prompt",
      name: "Other Prompt",
      description: "Something else.",
    });
  });

  it("--force (force: true) bypasses a hand-edit conflict", () => {
    const lastHash = hashContent("original content");
    const plan = planReconciliation(
      [{ name: "Release Notes", description: "Drafts release notes." }],
      ["release-notes"],
      {
        lastWrittenHashBySlug: { "release-notes": lastHash },
        currentContentBySlug: new Map([["release-notes", "hand-edited content"]]),
        force: true,
      },
    );
    expect(plan.actions).toEqual([
      { type: "update", slug: "release-notes", name: "Release Notes", description: "Drafts release notes." },
    ]);
  });
});

describe("planReconciliation (slug-collision conflicts, FR-010a)", () => {
  it("flags both prompts that derive the same slug, and writes neither", () => {
    const plan = planReconciliation(
      [
        { name: "Release Notes", description: "First." },
        { name: "release notes", description: "Second." },
      ],
      [],
    );
    expect(plan.actions).toEqual([{ type: "conflict", slug: "release-notes", reason: "slug-collision" }]);
  });

  it("a slug collision does not block an unrelated prompt from reconciling normally in the same run", () => {
    const plan = planReconciliation(
      [
        { name: "Release Notes", description: "First." },
        { name: "release notes", description: "Second." },
        { name: "Unrelated Prompt", description: "Fine." },
      ],
      [],
    );
    expect(plan.actions).toContainEqual({ type: "conflict", slug: "release-notes", reason: "slug-collision" });
    expect(plan.actions).toContainEqual({
      type: "create",
      slug: "unrelated-prompt",
      name: "Unrelated Prompt",
      description: "Fine.",
    });
  });

  it("--force does NOT bypass a slug-collision conflict", () => {
    const plan = planReconciliation(
      [
        { name: "Release Notes", description: "First." },
        { name: "release notes", description: "Second." },
      ],
      [],
      { force: true },
    );
    expect(plan.actions).toEqual([{ type: "conflict", slug: "release-notes", reason: "slug-collision" }]);
  });
});
