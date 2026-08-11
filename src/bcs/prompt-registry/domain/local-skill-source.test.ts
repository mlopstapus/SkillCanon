/**
 * 013-skill-import-and-external-registries/002, spec
 * 037-local-folder-skill-upload.
 */
import { describe, expect, it } from "vitest";
import { MAX_FILE_SIZE_BYTES } from "./prompt";
import { scanLocalSkillFolders, type LocalSkillFileEntry } from "./local-skill-source";

const skillMd = (content: string) => content;

describe("scanLocalSkillFolders", () => {
  it("detects a single root-level SKILL.md as one candidate", () => {
    const entries: LocalSkillFileEntry[] = [
      { relativePath: "SKILL.md", content: "---\nname: standalone-skill\ndescription: A standalone skill.\n---\nBody" },
    ];
    const result = scanLocalSkillFolders(entries);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      name: "standalone-skill",
      description: "A standalone skill.",
      folderPath: "",
      mainFile: { name: "SKILL.md" },
      supportingFiles: [],
    });
  });

  it("detects a SKILL.md nested under .claude/skills/<name>/", () => {
    const entries: LocalSkillFileEntry[] = [
      {
        relativePath: ".claude/skills/release-notes/SKILL.md",
        content: "---\nname: release-notes\ndescription: Generates release notes.\n---\nBody",
      },
    ];
    const result = scanLocalSkillFolders(entries);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      name: "release-notes",
      folderPath: ".claude/skills/release-notes",
    });
  });

  it("detects a SKILL.md nested under .agents/skills/<name>/", () => {
    const entries: LocalSkillFileEntry[] = [
      {
        relativePath: ".agents/skills/git-commit/SKILL.md",
        content: "---\nname: git-commit\ndescription: Writes commit messages.\n---\nBody",
      },
    ];
    const result = scanLocalSkillFolders(entries);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      name: "git-commit",
      folderPath: ".agents/skills/git-commit",
    });
  });

  it("falls back to the directory name when SKILL.md has no name frontmatter", () => {
    const entries: LocalSkillFileEntry[] = [
      { relativePath: ".claude/skills/my-tool/SKILL.md", content: "# Just a heading\nBody text." },
    ];
    const result = scanLocalSkillFolders(entries);
    expect(result.candidates[0]?.name).toBe("my-tool");
  });

  it("collects every other direct file in the same directory as supporting files, non-recursively", () => {
    const entries: LocalSkillFileEntry[] = [
      { relativePath: "my-skill/SKILL.md", content: skillMd("---\nname: my-skill\n---\nBody") },
      { relativePath: "my-skill/reference.md", content: "Reference material." },
      { relativePath: "my-skill/nested/ignored.md", content: "Should not be included (recursive)." },
    ];
    const result = scanLocalSkillFolders(entries);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.supportingFiles).toEqual([{ name: "reference.md", content: "Reference material." }]);
  });

  it("returns an empty candidates array (not an error) when no SKILL.md exists anywhere", () => {
    const entries: LocalSkillFileEntry[] = [
      { relativePath: "README.md", content: "Just a readme." },
      { relativePath: "src/index.ts", content: "console.log('hi');" },
    ];
    const result = scanLocalSkillFolders(entries);
    expect(result.candidates).toEqual([]);
    expect(result.invalidFolders).toEqual([]);
    expect(result.duplicateNames.size).toBe(0);
  });

  it("returns an empty candidates array for an empty entries list", () => {
    const result = scanLocalSkillFolders([]);
    expect(result.candidates).toEqual([]);
  });

  it("excludes a folder whose SKILL.md is empty, flagging it in invalidFolders (FR-010)", () => {
    const entries: LocalSkillFileEntry[] = [{ relativePath: "empty-skill/SKILL.md", content: "" }];
    const result = scanLocalSkillFolders(entries);
    expect(result.candidates).toEqual([]);
    expect(result.invalidFolders).toEqual([{ folderPath: "empty-skill", reason: expect.stringContaining("empty") }]);
  });

  it("excludes a folder whose SKILL.md exceeds MAX_FILE_SIZE_BYTES, flagging it in invalidFolders (FR-010)", () => {
    const oversized = "a".repeat(MAX_FILE_SIZE_BYTES + 1);
    const entries: LocalSkillFileEntry[] = [{ relativePath: "big-skill/SKILL.md", content: oversized }];
    const result = scanLocalSkillFolders(entries);
    expect(result.candidates).toEqual([]);
    expect(result.invalidFolders).toEqual([
      { folderPath: "big-skill", reason: expect.stringContaining(String(MAX_FILE_SIZE_BYTES)) },
    ]);
  });

  it("does not let one invalid folder affect an unrelated valid one in the same batch", () => {
    const entries: LocalSkillFileEntry[] = [
      { relativePath: "empty-skill/SKILL.md", content: "" },
      { relativePath: "valid-skill/SKILL.md", content: "---\nname: valid-skill\n---\nBody" },
    ];
    const result = scanLocalSkillFolders(entries);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.name).toBe("valid-skill");
    expect(result.invalidFolders).toHaveLength(1);
  });

  it("flags two candidates resolving to the same name as duplicates without dropping either (FR-013)", () => {
    const entries: LocalSkillFileEntry[] = [
      { relativePath: ".claude/skills/git-commit/SKILL.md", content: "---\nname: git-commit\n---\nBody A" },
      { relativePath: ".agents/skills/git-commit/SKILL.md", content: "---\nname: git-commit\n---\nBody B" },
    ];
    const result = scanLocalSkillFolders(entries);
    expect(result.candidates).toHaveLength(2);
    expect(result.duplicateNames).toEqual(new Set(["git-commit"]));
  });

  it("does not flag two distinctly-named candidates as duplicates", () => {
    const entries: LocalSkillFileEntry[] = [
      { relativePath: "a/SKILL.md", content: "---\nname: skill-a\n---\nBody" },
      { relativePath: "b/SKILL.md", content: "---\nname: skill-b\n---\nBody" },
    ];
    const result = scanLocalSkillFolders(entries);
    expect(result.duplicateNames.size).toBe(0);
  });

  it("returns every candidate from a large batch untruncated — no fixed cap (FR-014)", () => {
    const entries: LocalSkillFileEntry[] = Array.from({ length: 40 }, (_, i) => ({
      relativePath: `skill-${i}/SKILL.md`,
      content: `---\nname: skill-${i}\n---\nBody`,
    }));
    const result = scanLocalSkillFolders(entries);
    expect(result.candidates).toHaveLength(40);
    expect(new Set(result.candidates.map((c) => c.name)).size).toBe(40);
  });
});
