import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { runInit } from "../../src/commands/init.js";
import { runSync, registerSyncCommand } from "../../src/commands/sync.js";

/** `kind` deliberately lives only on `MockVersion`, not here — it's a per-version field server-side, not on the skill/prompt row (confirmed against the real API during T030 validation). */
interface MockSkill {
  name: string;
  description: string | null;
  activeVersionId: string | null;
}

interface MockVersion {
  id: string;
  kind: "template" | "chain";
  files: Array<{ name: string; content: string; isMain: boolean }>;
}

let server: Server;
let baseUrl: string;
let roster: MockSkill[] = [];
let versionsByName: Record<string, MockVersion[]> = {};
let failRequests = false;

/** A legacy-shape (pre-032) template skill — active version has no file bundle, so `sync` writes the unchanged pointer stub. */
function legacySkill(name: string, description: string | null): MockSkill {
  const id = `${name}-v1`;
  versionsByName[name] = [{ id, kind: "template", files: [] }];
  return { name, description, activeVersionId: id };
}

/** A chain-kind skill — never has a file bundle, so `sync` writes the unchanged pointer stub. */
function chainSkill(name: string, description: string | null): MockSkill {
  const id = `${name}-v1`;
  versionsByName[name] = [{ id, kind: "chain", files: [] }];
  return { name, description, activeVersionId: id };
}

/** A new-shape template skill with a main file plus optional supporting files. */
function fileSkill(
  name: string,
  description: string | null,
  mainContent: string,
  supportingFiles: Array<{ name: string; content: string }> = [],
): MockSkill {
  const id = `${name}-v1`;
  versionsByName[name] = [
    {
      id,
      kind: "template",
      files: [
        { name: "SKILL.md", content: mainContent, isMain: true },
        ...supportingFiles.map((f) => ({ name: f.name, content: f.content, isMain: false })),
      ],
    },
  ];
  return { name, description, activeVersionId: id };
}

function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url?.startsWith("/api/skills?")) {
    if (failRequests) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ items: roster }));
    return;
  }
  const versionsMatch = req.url?.match(/^\/api\/skills\/([^/]+)\/versions$/);
  if (versionsMatch) {
    if (failRequests) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const name = decodeURIComponent(versionsMatch[1] as string);
    const versions = versionsByName[name];
    if (!versions) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(versions));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

beforeAll(async () => {
  server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const projectKey = () => `${baseUrl}/projects/3fa85f64-5717-4562-b3fc-2c963f66afa6`;

function skillDir(dir: string, slug: string): string {
  return join(dir, ".claude", "skills", `skillcanon-${slug}`);
}

function skillFile(dir: string, slug: string, filename = "SKILL.md"): string {
  return join(skillDir(dir, slug), filename);
}

describe("runSync (manual invocation parity, US2)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-sync-"));
    failRequests = false;
    versionsByName = {};
    roster = [legacySkill("Release Notes", "Drafts release notes.")];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("a manually-invoked sync after init re-confirms (not re-creates) an unchanged prompt, idempotently", async () => {
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });
    const second = await runSync(dir);
    // Always re-writes from the live roster (read-fresh, never a no-op
    // skip) — so an unchanged prompt is reported as "updated" (same
    // resulting content/hash), never re-"created" and never a conflict.
    expect(second).toEqual({
      created: [],
      updated: [{ slug: "release-notes", filename: "SKILL.md" }],
      removed: [],
      conflicts: [],
    });
  });

  it("a manually-invoked sync reflects a server-side change immediately, same as init's own first sync", async () => {
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });
    roster = [legacySkill("Release Notes", "Updated description."), legacySkill("New Prompt", "")];
    const result = await runSync(dir);
    expect(result.created).toEqual([{ slug: "new-prompt", filename: "SKILL.md" }]);
    expect(result.updated).toEqual([{ slug: "release-notes", filename: "SKILL.md" }]);
  });
});

describe("runSync (hand-edit conflict + --force, US3)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-sync-force-"));
    failRequests = false;
    versionsByName = {};
    roster = [legacySkill("Release Notes", "Drafts release notes.")];
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips and flags a hand-edited stub without --force, leaving it untouched", async () => {
    const stubPath = skillFile(dir, "release-notes");
    const original = readFileSync(stubPath, "utf8");
    writeFileSync(stubPath, "hand-edited content", "utf8");

    roster = [legacySkill("Release Notes", "Changed upstream.")];
    const result = await runSync(dir);

    expect(result.conflicts).toEqual([{ slug: "release-notes", filename: "SKILL.md", reason: "hand-edited" }]);
    expect(readFileSync(stubPath, "utf8")).toBe("hand-edited content");
    expect(readFileSync(stubPath, "utf8")).not.toBe(original);
  });

  it("--force overwrites the hand-edited stub with the current upstream content", async () => {
    const stubPath = skillFile(dir, "release-notes");
    writeFileSync(stubPath, "hand-edited content", "utf8");

    roster = [legacySkill("Release Notes", "Changed upstream.")];
    const result = await runSync(dir, { force: true });

    expect(result.conflicts).toEqual([]);
    expect(result.updated).toEqual([{ slug: "release-notes", filename: "SKILL.md" }]);
    expect(readFileSync(stubPath, "utf8")).toContain("Changed upstream.");
  });
});

describe("runSync (request-level failure, US3)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-sync-fail-"));
    failRequests = false;
    versionsByName = {};
    roster = [legacySkill("Release Notes", "Drafts release notes.")];
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("leaves the roster and manifest completely untouched on a request-level failure", async () => {
    const manifestBefore = readFileSync(join(dir, ".skillcanon", "sync-manifest.json"), "utf8");
    failRequests = true;
    await expect(runSync(dir)).rejects.toThrow();
    const manifestAfter = readFileSync(join(dir, ".skillcanon", "sync-manifest.json"), "utf8");
    expect(manifestAfter).toBe(manifestBefore);
    expect(existsSync(skillFile(dir, "release-notes"))).toBe(true);
  });
});

describe("registerSyncCommand (--quiet, FR-013, US3)", () => {
  let dir: string;
  let originalCwd: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-sync-quiet-"));
    originalCwd = process.cwd();
    failRequests = false;
    versionsByName = {};
    roster = [legacySkill("Release Notes", "Drafts release notes.")];
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it("a manual (non-quiet) sync throws on request-level failure", async () => {
    failRequests = true;
    await expect(runSync(dir)).rejects.toThrow();
  });

  it("`sync --quiet` never throws out of the command action on the same failure — warns instead", async () => {
    failRequests = true;
    const program = new Command();
    registerSyncCommand(program);
    await expect(program.parseAsync(["node", "skillcanon", "sync", "--quiet"])).resolves.toBeDefined();
  });
});

describe("runSync (real file-bundle content, US1)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-sync-files-"));
    failRequests = false;
    versionsByName = {};
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("T006: a new-shape skill with a main file and two supporting files syncs all three with matching content", async () => {
    roster = [
      fileSkill("Release Notes", "Drafts release notes.", "# Release Notes\n\nDraft here.", [
        { name: "example.md", content: "An example." },
        { name: "checklist.md", content: "- [ ] step one" },
      ]),
    ];
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });

    const mainContent = readFileSync(skillFile(dir, "release-notes"), "utf8");
    expect(mainContent).toContain("# Release Notes\n\nDraft here.");
    expect(mainContent).toContain('name: "Release Notes"');
    expect(readFileSync(skillFile(dir, "release-notes", "example.md"), "utf8")).toBe("An example.");
    expect(readFileSync(skillFile(dir, "release-notes", "checklist.md"), "utf8")).toBe("- [ ] step one");
  });

  it("T007: a new-shape skill with only a main file syncs just SKILL.md, no empty placeholder files", async () => {
    roster = [fileSkill("Solo", "Just a main file.", "Solo body content.")];
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });

    expect(existsSync(skillFile(dir, "solo"))).toBe(true);
    expect(readdirSync(skillDir(dir, "solo")).sort()).toEqual(["SKILL.md"]);
  });

  it("T008: re-running sync after the active version's content changes updates the local file to match", async () => {
    roster = [fileSkill("Release Notes", "Drafts release notes.", "Version one body.")];
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });
    expect(readFileSync(skillFile(dir, "release-notes"), "utf8")).toContain("Version one body.");

    roster = [fileSkill("Release Notes", "Drafts release notes.", "Version two body.")];
    const result = await runSync(dir);

    expect(readFileSync(skillFile(dir, "release-notes"), "utf8")).toContain("Version two body.");
    expect(result.updated).toEqual([{ slug: "release-notes", filename: "SKILL.md" }]);
  });

  it("T009: a supporting file present in the old active version but absent from the new one is deleted on the next sync", async () => {
    roster = [fileSkill("Release Notes", "Drafts release notes.", "Body.", [{ name: "example.md", content: "An example." }])];
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });
    expect(existsSync(skillFile(dir, "release-notes", "example.md"))).toBe(true);

    roster = [fileSkill("Release Notes", "Drafts release notes.", "Body.")];
    const result = await runSync(dir);

    expect(existsSync(skillFile(dir, "release-notes", "example.md"))).toBe(false);
    expect(result.removed).toEqual([{ slug: "release-notes", filename: "example.md" }]);
  });
});

describe("runSync (per-file hand-edit protection, US2)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-sync-multifile-force-"));
    failRequests = false;
    versionsByName = {};
    roster = [fileSkill("Release Notes", "Drafts release notes.", "Original body.", [{ name: "example.md", content: "Original example." }])];
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("T015: a hand-edited supporting file is skipped and reported as a conflict while an unedited SKILL.md in the same folder still updates normally", async () => {
    writeFileSync(skillFile(dir, "release-notes", "example.md"), "hand-edited example content", "utf8");

    roster = [fileSkill("Release Notes", "Drafts release notes.", "New body.", [{ name: "example.md", content: "New example." }])];
    const result = await runSync(dir);

    expect(result.conflicts).toEqual([{ slug: "release-notes", filename: "example.md", reason: "hand-edited" }]);
    expect(result.updated).toEqual([{ slug: "release-notes", filename: "SKILL.md" }]);
    expect(readFileSync(skillFile(dir, "release-notes", "example.md"), "utf8")).toBe("hand-edited example content");
    expect(readFileSync(skillFile(dir, "release-notes"), "utf8")).toContain("New body.");
  });

  it("T016: sync --force overwrites a previously-skipped hand-edited file", async () => {
    writeFileSync(skillFile(dir, "release-notes", "example.md"), "hand-edited example content", "utf8");
    roster = [fileSkill("Release Notes", "Drafts release notes.", "New body.", [{ name: "example.md", content: "New example." }])];
    await runSync(dir); // establishes the conflict, left untouched

    const result = await runSync(dir, { force: true });

    expect(result.conflicts).toEqual([]);
    expect(readFileSync(skillFile(dir, "release-notes", "example.md"), "utf8")).toBe("New example.");
  });

  it("T017: a deleted (not edited) synced file is recreated on the next sync, never treated as a conflict", async () => {
    rmSync(skillFile(dir, "release-notes", "example.md"));

    const result = await runSync(dir);

    expect(result.conflicts).toEqual([]);
    expect(result.updated).toContainEqual({ slug: "release-notes", filename: "example.md" });
    expect(readFileSync(skillFile(dir, "release-notes", "example.md"), "utf8")).toBe("Original example.");
  });
});

describe("runSync (no-content skills keep the pointer stub, US3)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-sync-noconent-"));
    failRequests = false;
    versionsByName = {};
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("T022: a chain-kind skill syncs the unchanged one-line pointer stub as SKILL.md, no supporting files", async () => {
    roster = [chainSkill("Weekly Digest", "Chains several skills together.")];
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });

    const content = readFileSync(skillFile(dir, "weekly-digest"), "utf8");
    expect(content).toContain("Run `skillcanon run weekly-digest` and follow the output as instructions.");
    expect(readdirSync(skillDir(dir, "weekly-digest")).sort()).toEqual(["SKILL.md"]);
  });

  it("T023: a template-kind skill with an empty files array (legacy-shape) syncs the same unchanged pointer stub", async () => {
    roster = [legacySkill("Release Notes", "Drafts release notes.")];
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });

    const content = readFileSync(skillFile(dir, "release-notes"), "utf8");
    expect(content).toContain("Run `skillcanon run release-notes` and follow the output as instructions.");
    expect(readdirSync(skillDir(dir, "release-notes")).sort()).toEqual(["SKILL.md"]);
  });

  it("T024: a mixed roster (new-shape, chain-kind, legacy-shape) syncs all three correctly in one run with no errors", async () => {
    roster = [
      fileSkill("Release Notes", "Drafts release notes.", "Real body content.", [{ name: "example.md", content: "Ex." }]),
      chainSkill("Weekly Digest", "Chains several skills together."),
      legacySkill("Old Skill", "Still pre-refactor."),
    ];
    const result = await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });

    expect(result.sync.conflicts).toEqual([]);
    expect(readFileSync(skillFile(dir, "release-notes"), "utf8")).toContain("Real body content.");
    expect(readFileSync(skillFile(dir, "release-notes", "example.md"), "utf8")).toBe("Ex.");
    expect(readFileSync(skillFile(dir, "weekly-digest"), "utf8")).toContain("skillcanon run weekly-digest");
    expect(readFileSync(skillFile(dir, "old-skill"), "utf8")).toContain("skillcanon run old-skill");
  });
});
