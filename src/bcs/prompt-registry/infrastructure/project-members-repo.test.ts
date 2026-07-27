import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isUniqueViolation } from "@/shared/db/postgres-errors";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { createTestProject, makeProjectFixtureOrg } from "../application/project-test-helpers";
import { insert, listByProject } from "./project-members-repo";

describe("project members repository", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("enforces unique membership by project and user", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    const project = await createTestProject(testDb, fixture);
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      insert(tx, { id: randomUUID(), projectId: project.id, userId: fixture.actorUserId, role: "member" }),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        insert(tx, { id: randomUUID(), projectId: project.id, userId: fixture.actorUserId, role: "member" }),
      ),
    ).rejects.toSatisfy(isUniqueViolation);
  });

  it("orders members by creation time", async () => {
    const fixture = await makeProjectFixtureOrg(testDb);
    const project = await createTestProject(testDb, fixture);
    await withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
      await insert(tx, { id: randomUUID(), projectId: project.id, userId: fixture.actorUserId, role: "member" });
      await insert(tx, { id: randomUUID(), projectId: project.id, userId: fixture.otherUserId, role: "owner" });
      expect((await listByProject(tx, project.id)).map((row) => row.userId)).toEqual([
        fixture.actorUserId,
        fixture.otherUserId,
      ]);
    });
  });
});
