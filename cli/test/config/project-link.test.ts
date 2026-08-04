import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseProjectKey, readProjectLink, writeProjectLink } from "../../src/config/project-link.js";

describe("parseProjectKey", () => {
  it("extracts server origin and projectId from a valid project URL", () => {
    const result = parseProjectKey("https://skillcanon.example.com/projects/3fa85f64-5717-4562-b3fc-2c963f66afa6");
    expect(result).toEqual({
      server: "https://skillcanon.example.com",
      projectId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    });
  });

  it("throws a clear error for a non-URL string", () => {
    expect(() => parseProjectKey("not-a-url")).toThrow(/project key/i);
  });

  it("throws a clear error when the path is missing the /projects/<uuid> shape", () => {
    expect(() => parseProjectKey("https://skillcanon.example.com/dashboard")).toThrow(/project key/i);
  });

  it("strips a trailing slash from the origin", () => {
    const result = parseProjectKey("https://skillcanon.example.com:3001/projects/3fa85f64-5717-4562-b3fc-2c963f66afa6/");
    expect(result.server).toBe("https://skillcanon.example.com:3001");
  });
});

describe("readProjectLink / writeProjectLink", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-project-link-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes .skillcanon/project.json and reads it back", () => {
    writeProjectLink(dir, { server: "https://skillcanon.example.com", projectId: "abc-123" });
    const raw = JSON.parse(readFileSync(join(dir, ".skillcanon", "project.json"), "utf8"));
    expect(raw).toEqual({ server: "https://skillcanon.example.com", projectId: "abc-123" });

    const link = readProjectLink(dir);
    expect(link).toEqual({ server: "https://skillcanon.example.com", projectId: "abc-123" });
  });

  it("throws a clear error when project.json is missing", () => {
    expect(() => readProjectLink(dir)).toThrow(/run .*init/i);
  });

  it("overwrites an existing project.json idempotently on re-write", () => {
    writeProjectLink(dir, { server: "https://a.example.com", projectId: "1" });
    writeProjectLink(dir, { server: "https://b.example.com", projectId: "2" });
    expect(readProjectLink(dir)).toEqual({ server: "https://b.example.com", projectId: "2" });
  });
});
