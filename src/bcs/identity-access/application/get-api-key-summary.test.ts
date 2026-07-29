import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { insert as insertUser } from "../infrastructure/users-repo";
import { insert as insertApiKey } from "../infrastructure/api-keys-repo";
import { getApiKeySummary } from "./get-api-key-summary";

describe("getApiKeySummary", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns the key summary (never the hash) for a key in the caller's organization", async () => {
    const { id: organizationId } = await insertOrg(testDb.authDb, {
      name: "Acme",
      slug: `acme-${randomUUID()}`,
    });
    const { id: teamId } = await insertTeam(testDb.authDb, {
      organizationId,
      name: "Root",
      slug: `root-${randomUUID()}`,
    });
    const { id: userId } = await insertUser(testDb.authDb, {
      organizationId,
      teamId,
      username: `alice-${randomUUID()}`,
      displayName: "Alice",
      email: `alice-${randomUUID()}@example.com`,
      passwordHash: "hash",
      role: "admin",
    });
    const { id: apiKeyId } = await insertApiKey(testDb.authDb, {
      organizationId,
      userId,
      name: "staging-ci",
      keyHash: `hash-${randomUUID()}`,
      prefix: "sk_abcd",
      scopes: ["prompts:read"],
    });

    const summary = await getApiKeySummary(testDb.authDb, organizationId, apiKeyId);

    expect(summary).toMatchObject({
      id: apiKeyId,
      userId,
      name: "staging-ci",
      prefix: "sk_abcd",
      scopes: ["prompts:read"],
      isActive: true,
    });
    expect(summary).not.toHaveProperty("keyHash");
  });

  it("returns null for a nonexistent api key id", async () => {
    const { id: organizationId } = await insertOrg(testDb.authDb, {
      name: "Acme",
      slug: `acme-${randomUUID()}`,
    });

    const summary = await getApiKeySummary(testDb.authDb, organizationId, randomUUID());

    expect(summary).toBeNull();
  });

  it("returns null (not the row) for an api key id belonging to a different organization (M3)", async () => {
    const { id: orgA } = await insertOrg(testDb.authDb, {
      name: "Org A",
      slug: `org-a-${randomUUID()}`,
    });
    const { id: orgB } = await insertOrg(testDb.authDb, {
      name: "Org B",
      slug: `org-b-${randomUUID()}`,
    });
    const { id: teamB } = await insertTeam(testDb.authDb, {
      organizationId: orgB,
      name: "Root",
      slug: `root-${randomUUID()}`,
    });
    const { id: userB } = await insertUser(testDb.authDb, {
      organizationId: orgB,
      teamId: teamB,
      username: `bob-${randomUUID()}`,
      displayName: "Bob",
      email: `bob-${randomUUID()}@example.com`,
      passwordHash: "hash",
      role: "admin",
    });
    const { id: apiKeyId } = await insertApiKey(testDb.authDb, {
      organizationId: orgB,
      userId: userB,
      name: "legacy-mcp-bridge",
      keyHash: `hash-${randomUUID()}`,
      prefix: "sk_efgh",
      scopes: ["prompts:read"],
    });

    const summary = await getApiKeySummary(testDb.authDb, orgA, apiKeyId);

    expect(summary).toBeNull();
  });
});
