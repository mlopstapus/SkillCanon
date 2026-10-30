import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { normalizeGitRemoteUrl } from "../domain/prompt-usage";
import { queryUsageByRepoAndCommits } from "./query-usage-by-repo-and-commits";
import { recordPromptUsage } from "./record-prompt-usage";

describe("normalizeGitRemoteUrl", () => {
  it("maps SSH, HTTPS, credentialed and .git forms of one repo to one value", () => {
    const forms = [
      "git@github.com:Acme/Repo.git",
      "https://github.com/acme/repo",
      "https://github.com/acme/repo.git/",
      "https://user:secret@github.com/acme/repo.git",
      "ssh://git@github.com/acme/repo.git",
      "git://github.com/acme/repo",
    ];
    expect(new Set(forms.map(normalizeGitRemoteUrl))).toEqual(new Set(["github.com/acme/repo"]));
  });

  it("never keeps credentials and returns null for junk", () => {
    expect(normalizeGitRemoteUrl("https://user:secret@github.com/acme/repo")).not.toContain("secret");
    expect(normalizeGitRemoteUrl("")).toBeNull();
    expect(normalizeGitRemoteUrl("not a remote")).toBeNull();
    expect(normalizeGitRemoteUrl("file:///tmp/repo")).toBeNull();
    expect(normalizeGitRemoteUrl(null)).toBeNull();
  });
});

describe("queryUsageByRepoAndCommits", () => {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);
  afterAll(async () => testDb.teardown());

  const record = (organizationId: string, over: Partial<Parameters<typeof recordPromptUsage>[1]>) =>
    withTenantContext(testDb.appDb, organizationId, (tx) =>
      recordPromptUsage(tx, { organizationId, promptId: randomUUID(), promptVersionId: randomUUID(), promptVersion: "1", ...over }),
    );
  const query = (organizationId: string, remote: string, shas: string[]) =>
    withTenantContext(testDb.appDb, organizationId, (tx) => queryUsageByRepoAndCommits(tx, organizationId, remote, shas));

  it("matches rows recorded over SSH when queried over HTTPS, and only for the listed commits", async () => {
    const org = randomUUID();
    await record(org, { gitRemoteUrl: "git@github.com:acme/repo.git", gitBranch: "main", gitCommitSha: "ABC123" });
    await record(org, { gitRemoteUrl: "https://github.com/acme/repo", gitCommitSha: "def456" });
    await record(org, { gitRemoteUrl: "https://github.com/acme/other", gitCommitSha: "abc123" });
    const rows = await query(org, "https://github.com/acme/repo.git", ["abc123"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ gitCommitSha: "abc123", gitBranch: "main" });
    expect(await query(org, "https://github.com/acme/repo", ["abc123", "def456"])).toHaveLength(2);
  });

  it("returns nothing for empty input, unrecognized remotes, failed serves and rows without git context", async () => {
    const org = randomUUID();
    await record(org, { gitRemoteUrl: "github.com/x", gitCommitSha: "a1" });
    await record(org, { gitRemoteUrl: "https://github.com/acme/repo", gitCommitSha: "bad1", statusCode: 500 });
    await record(org, {});
    expect(await query(org, "https://github.com/acme/repo", [])).toEqual([]);
    expect(await query(org, "nonsense", ["a1"])).toEqual([]);
    expect(await query(org, "https://github.com/acme/repo", ["bad1"])).toEqual([]);
  });

  it("never returns another organization's rows even for a matching remote and commit", async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    await record(a, { gitRemoteUrl: "https://github.com/acme/repo", gitCommitSha: "shared1" });
    expect(await query(b, "https://github.com/acme/repo", ["shared1"])).toEqual([]);
    expect(await query(a, "https://github.com/acme/repo", ["shared1"])).toHaveLength(1);
  });
});
