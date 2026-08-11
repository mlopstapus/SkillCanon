import { describe, expect, it } from "vitest";
import { parseSkillFrontmatter } from "./external-skill-source";

describe("parseSkillFrontmatter", () => {
  it("reads name and description from SKILL.md frontmatter", () => {
    const content = "---\nname: pdf-table-extract\ndescription: Extracts tables from PDFs.\n---\n\n# Instructions\nDo the thing.";
    expect(parseSkillFrontmatter(content, "fallback")).toEqual({
      name: "pdf-table-extract",
      description: "Extracts tables from PDFs.",
    });
  });

  it("strips quotes around frontmatter values", () => {
    const content = '---\nname: "quoted-name"\ndescription: \'quoted desc\'\n---\nBody';
    expect(parseSkillFrontmatter(content, "fallback")).toEqual({
      name: "quoted-name",
      description: "quoted desc",
    });
  });

  it("falls back to the given folder name when frontmatter has no name field", () => {
    const content = "---\ndescription: Only a description.\n---\nBody";
    expect(parseSkillFrontmatter(content, "my-folder").name).toBe("my-folder");
  });

  it("falls back to the first non-heading, non-blank line when there is no description", () => {
    const content = "# My Skill\n\nThis is the first real line.\nSecond line.";
    expect(parseSkillFrontmatter(content, "fallback").description).toBe("This is the first real line.");
  });

  it("falls back to the folder name and an empty description when there is no frontmatter and no body text", () => {
    const content = "# Just A Heading\n";
    expect(parseSkillFrontmatter(content, "my-folder")).toEqual({ name: "my-folder", description: "" });
  });
});
