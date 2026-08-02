import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { listGroupedByMemberForProject } from "../infrastructure/prompt-usage-repo";
import { recordPromptUsage } from "./record-prompt-usage";

describe("recordPromptUsage", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("inserts a row with every field populated", async () => {
    const organizationId = randomUUID();
    const projectId = randomUUID();
    const userId = randomUUID();
    const promptId = randomUUID();
    const promptVersionId = randomUUID();

    await withTenantContext(testDb.appDb, organizationId, (tx) =>
      recordPromptUsage(tx, { organizationId, promptId, promptVersionId, projectId, userId }),
    );

    const byMember = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      listGroupedByMemberForProject(tx, organizationId, projectId),
    );
    expect(byMember).toEqual([{ userId, runCount: 1, lastActiveAt: expect.any(Date) }]);
  });

  it("inserts successfully with nullable projectId/userId (ad hoc, ungoverned usage)", async () => {
    const organizationId = randomUUID();
    const promptId = randomUUID();
    const promptVersionId = randomUUID();

    await expect(
      withTenantContext(testDb.appDb, organizationId, (tx) =>
        recordPromptUsage(tx, { organizationId, promptId, promptVersionId, projectId: null, userId: null }),
      ),
    ).resolves.toBeUndefined();
  });

  it("scopes a row to its own organizationId/projectId", async () => {
    const organizationId = randomUUID();
    const otherProjectId = randomUUID();
    const projectId = randomUUID();
    const userId = randomUUID();
    const promptId = randomUUID();
    const promptVersionId = randomUUID();

    await withTenantContext(testDb.appDb, organizationId, (tx) =>
      recordPromptUsage(tx, { organizationId, promptId, promptVersionId, projectId, userId }),
    );

    const forOtherProject = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      listGroupedByMemberForProject(tx, organizationId, otherProjectId),
    );
    expect(forOtherProject).toEqual([]);
  });
});
