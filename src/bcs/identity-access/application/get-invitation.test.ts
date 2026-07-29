import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { insert as insertUser } from "../infrastructure/users-repo";
import { insert as insertInvitation } from "../infrastructure/invitations-repo";
import { getInvitation } from "./get-invitation";

describe("getInvitation", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns the invitation summary for an invitation in the caller's organization", async () => {
    const { id: organizationId } = await insertOrg(testDb.authDb, {
      name: "Acme",
      slug: `acme-${randomUUID()}`,
    });
    const { id: teamId } = await insertTeam(testDb.authDb, {
      organizationId,
      name: "Root",
      slug: `root-${randomUUID()}`,
    });
    const { id: inviterId } = await insertUser(testDb.authDb, {
      organizationId,
      teamId,
      username: `alice-${randomUUID()}`,
      displayName: "Alice",
      email: `alice-${randomUUID()}@example.com`,
      passwordHash: "hash",
      role: "admin",
    });
    const email = `erin-${randomUUID()}@example.com`;
    const { id: invitationId } = await insertInvitation(testDb.authDb, {
      organizationId,
      teamId,
      email,
      role: "member",
      token: randomUUID(),
      invitedById: inviterId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    });

    const invitation = await getInvitation(testDb.authDb, organizationId, invitationId);

    expect(invitation).toMatchObject({
      id: invitationId,
      email,
      teamId,
      role: "member",
      state: "pending",
    });
  });

  it("returns null for a nonexistent invitation id", async () => {
    const { id: organizationId } = await insertOrg(testDb.authDb, {
      name: "Acme",
      slug: `acme-${randomUUID()}`,
    });

    const invitation = await getInvitation(testDb.authDb, organizationId, randomUUID());

    expect(invitation).toBeNull();
  });

  it("returns null (not the row) for an invitation id belonging to a different organization (M3)", async () => {
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
    const { id: inviterB } = await insertUser(testDb.authDb, {
      organizationId: orgB,
      teamId: teamB,
      username: `bob-${randomUUID()}`,
      displayName: "Bob",
      email: `bob-${randomUUID()}@example.com`,
      passwordHash: "hash",
      role: "admin",
    });
    const { id: invitationId } = await insertInvitation(testDb.authDb, {
      organizationId: orgB,
      teamId: teamB,
      email: `carol-${randomUUID()}@example.com`,
      role: "member",
      token: randomUUID(),
      invitedById: inviterB,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    });

    const invitation = await getInvitation(testDb.authDb, orgA, invitationId);

    expect(invitation).toBeNull();
  });
});
