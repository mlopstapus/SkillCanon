import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExternalSourceNotFoundError,
  ExternalSourceUnreachableError,
  InvalidExternalSourceError,
} from "../domain/external-skill-source";
import { fetchExternalSkillSource } from "./fetch-external-skill-source";

interface DirEntry {
  name: string;
  path: string;
  type: "file" | "dir";
}
type GithubFsEntry = DirEntry[] | { content: string; encoding: "base64" };

function b64(text: string) {
  return Buffer.from(text, "utf8").toString("base64");
}

/** Maps a repo-relative path ("" for root) to either a directory listing or a file body, mirroring the real Contents API's two response shapes. */
function mockGithubFs(fs: Record<string, GithubFsEntry>) {
  return vi.fn(async (url: string | URL) => {
    const u = new URL(url);
    const match = /^\/repos\/[^/]+\/[^/]+\/contents\/?(.*)$/.exec(u.pathname);
    const path = match ? decodeURIComponent(match[1] ?? "") : "__no_match__";
    const entry = fs[path];
    if (entry === undefined) {
      return { ok: false, status: 404, json: async () => ({ message: "Not Found" }) } as Response;
    }
    return { ok: true, status: 200, json: async () => entry } as Response;
  });
}

describe("fetchExternalSkillSource", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a non-GitHub source before making any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchExternalSkillSource("not a valid source")).rejects.toThrow(InvalidExternalSourceError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("imports a single skill published directly at the repo root (FR-001/FR-003)", async () => {
    vi.stubGlobal(
      "fetch",
      mockGithubFs({
        "": [
          { name: "SKILL.md", path: "SKILL.md", type: "file" },
          { name: "helper.md", path: "helper.md", type: "file" },
        ],
        "SKILL.md": {
          content: b64("---\nname: my-skill\ndescription: Does a thing.\n---\n\nInstructions."),
          encoding: "base64",
        },
        "helper.md": { content: b64("helper content"), encoding: "base64" },
      }),
    );

    const result = await fetchExternalSkillSource("owner/repo");

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toMatchObject({
      name: "my-skill",
      description: "Does a thing.",
      mainFile: { name: "SKILL.md", content: "---\nname: my-skill\ndescription: Does a thing.\n---\n\nInstructions." },
      supportingFiles: [{ name: "helper.md", content: "helper content" }],
    });
  });

  it("discovers multiple skills under a skills/ directory (FR-004)", async () => {
    vi.stubGlobal(
      "fetch",
      mockGithubFs({
        "": [
          { name: "skills", path: "skills", type: "dir" },
          { name: "README.md", path: "README.md", type: "file" },
        ],
        skills: [
          { name: "skill-a", path: "skills/skill-a", type: "dir" },
          { name: "skill-b", path: "skills/skill-b", type: "dir" },
        ],
        "skills/skill-a": [{ name: "SKILL.md", path: "skills/skill-a/SKILL.md", type: "file" }],
        "skills/skill-a/SKILL.md": { content: b64("# Skill A"), encoding: "base64" },
        "skills/skill-b": [{ name: "SKILL.md", path: "skills/skill-b/SKILL.md", type: "file" }],
        "skills/skill-b/SKILL.md": { content: b64("# Skill B"), encoding: "base64" },
      }),
    );

    const result = await fetchExternalSkillSource("owner/repo");

    expect(result.skills.map((s) => s.name).sort()).toEqual(["skill-a", "skill-b"]);
  });

  it("falls back to scanning top-level subdirectories when there's no skills/ directory (FR-004)", async () => {
    vi.stubGlobal(
      "fetch",
      mockGithubFs({
        "": [
          { name: "pdf-table-extract", path: "pdf-table-extract", type: "dir" },
          { name: "changelog-writer", path: "changelog-writer", type: "dir" },
          { name: "docs", path: "docs", type: "dir" },
        ],
        "pdf-table-extract": [
          { name: "SKILL.md", path: "pdf-table-extract/SKILL.md", type: "file" },
          { name: "extract.py", path: "pdf-table-extract/extract.py", type: "file" },
        ],
        "pdf-table-extract/SKILL.md": { content: b64("# PDF extract"), encoding: "base64" },
        "pdf-table-extract/extract.py": { content: b64("print('hi')"), encoding: "base64" },
        "changelog-writer": [{ name: "SKILL.md", path: "changelog-writer/SKILL.md", type: "file" }],
        "changelog-writer/SKILL.md": { content: b64("# Changelog"), encoding: "base64" },
        "docs": [{ name: "index.md", path: "docs/index.md", type: "file" }],
      }),
    );

    const result = await fetchExternalSkillSource("owner/repo");

    // "docs" has no SKILL.md and is correctly excluded.
    expect(result.skills.map((s) => s.name).sort()).toEqual(["changelog-writer", "pdf-table-extract"]);
    const extracted = result.skills.find((s) => s.name === "pdf-table-extract");
    expect(extracted?.supportingFiles).toEqual([{ name: "extract.py", content: "print('hi')" }]);
  });

  it("throws ExternalSourceNotFoundError when the source is reachable but has no SKILL.md anywhere (FR-011)", async () => {
    vi.stubGlobal(
      "fetch",
      mockGithubFs({
        "": [{ name: "README.md", path: "README.md", type: "file" }],
      }),
    );

    await expect(fetchExternalSkillSource("owner/repo")).rejects.toThrow(ExternalSourceNotFoundError);
  });

  it("throws ExternalSourceNotFoundError when the repository/path itself doesn't exist", async () => {
    vi.stubGlobal("fetch", mockGithubFs({}));

    await expect(fetchExternalSkillSource("owner/does-not-exist")).rejects.toThrow(ExternalSourceNotFoundError);
  });

  it("throws ExternalSourceUnreachableError on a rate-limit/forbidden response (FR-012)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }) as Response),
    );

    await expect(fetchExternalSkillSource("owner/repo")).rejects.toThrow(ExternalSourceUnreachableError);
  });

  it("throws ExternalSourceUnreachableError when the network request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }),
    );

    await expect(fetchExternalSkillSource("owner/repo")).rejects.toThrow(ExternalSourceUnreachableError);
  });
});
