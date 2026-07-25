import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { insert as insertUser } from "../infrastructure/users-repo";
import {
  insert as insertInvitation,
  markAccepted,
  markRevoked,
} from "../infrastructure/invitations-repo";
import { previewInvitation } from "./preview-invitation";

async function makeOrgTeamAdmin(testDb: TestDb) {
  const { id: organizationId } = await insertOrg(testDb.authDb, {
    name: "Acme Corp",
    slug: `acme-${randomUUID()}`,
  });
  const { id: teamId } = await insertTeam(testDb.authDb, {
    organizationId,
    name: "Platform",
    slug: `platform-${randomUUID()}`,
  });
  const { id: adminId } = await insertUser(testDb.authDb, {
    organizationId,
    teamId,
    username: `admin-${randomUUID()}`,
    displayName: "Admin",
    email: `admin-${randomUUID()}@example.com`,
    passwordHash: "hash",
    role: "admin",
  });
  return { organizationId, teamId, adminId };
}

async function makeInvitation(
  testDb: TestDb,
  fixture: { organizationId: string; teamId: string; adminId: string },
  overrides: { expiresAt?: Date; email?: string; role?: "admin" | "member" } = {},
) {
  const token = randomUUID();
  const { id } = await insertInvitation(testDb.authDb, {
    organizationId: fixture.organizationId,
    teamId: fixture.teamId,
    email: overrides.email ?? `kai-${randomUUID()}@example.com`,
    role: overrides.role ?? "member",
    token,
    invitedById: fixture.adminId,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60),
  });
  return { id, token };
}

describe("previewInvitation", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("resolves a pending invitation's org name, team name, role, email, and state", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { token } = await makeInvitation(testDb, fixture, {
      email: "kai@example.com",
      role: "admin",
    });

    const preview = await previewInvitation(testDb.authDb, token);

    expect(preview).toEqual({
      state: "pending",
      email: "kai@example.com",
      orgName: "Acme Corp",
      teamName: "Platform",
      role: "admin",
    });
  });

  it("returns null for a token matching no invitation", async () => {
    const preview = await previewInvitation(testDb.authDb, randomUUID());
    expect(preview).toBeNull();
  });

  it("reports an expired invitation's state as expired", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { token } = await makeInvitation(testDb, fixture, {
      expiresAt: new Date(Date.now() - 1000),
    });

    const preview = await previewInvitation(testDb.authDb, token);

    expect(preview?.state).toBe("expired");
  });

  it("reports an accepted invitation's state as accepted", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { id, token } = await makeInvitation(testDb, fixture);
    await markAccepted(testDb.authDb, id);

    const preview = await previewInvitation(testDb.authDb, token);

    expect(preview?.state).toBe("accepted");
  });

  it("reports a revoked invitation's state as revoked, even past its expiry", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { id, token } = await makeInvitation(testDb, fixture, {
      expiresAt: new Date(Date.now() - 1000),
    });
    await markRevoked(testDb.authDb, id);

    const preview = await previewInvitation(testDb.authDb, token);

    expect(preview?.state).toBe("revoked");
  });

  it("never exposes the token itself in the returned shape", async () => {
    const fixture = await makeOrgTeamAdmin(testDb);
    const { token } = await makeInvitation(testDb, fixture);

    const preview = await previewInvitation(testDb.authDb, token);

    expect(preview).not.toHaveProperty("token");
    expect(preview).not.toHaveProperty("id");
  });
});
