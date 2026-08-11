import { describe, expect, it } from "vitest";
import { InvalidExternalSourceError } from "../domain/external-skill-source";
import { parseGithubSource } from "./github-skill-source";

describe("parseGithubSource", () => {
  it("parses the owner/repo shorthand", () => {
    expect(parseGithubSource("anthropics/skills")).toEqual({ owner: "anthropics", repo: "skills", path: "" });
  });

  it("parses owner/repo/subpath", () => {
    expect(parseGithubSource("anthropics/skills/pdf-table-extract")).toEqual({
      owner: "anthropics",
      repo: "skills",
      path: "pdf-table-extract",
    });
  });

  it("parses a full https URL", () => {
    expect(parseGithubSource("https://github.com/anthropics/skills")).toEqual({
      owner: "anthropics",
      repo: "skills",
      path: "",
    });
  });

  it("parses a bare github.com/ URL with no protocol", () => {
    expect(parseGithubSource("github.com/anthropics/skills")).toEqual({
      owner: "anthropics",
      repo: "skills",
      path: "",
    });
  });

  it("parses GitHub's own /tree/<branch>/<path> web URL shape", () => {
    expect(parseGithubSource("https://github.com/anthropics/skills/tree/main/pdf-table-extract")).toEqual({
      owner: "anthropics",
      repo: "skills",
      path: "pdf-table-extract",
      ref: "main",
    });
  });

  it("strips a trailing .git and trailing slashes", () => {
    expect(parseGithubSource("owner/repo.git/")).toEqual({ owner: "owner", repo: "repo", path: "" });
  });

  it("rejects a source with fewer than owner/repo", () => {
    expect(() => parseGithubSource("just-a-name")).toThrow(InvalidExternalSourceError);
  });

  it("rejects a non-GitHub host", () => {
    expect(() => parseGithubSource("https://gitlab.com/owner/repo")).toThrow(InvalidExternalSourceError);
  });
});
