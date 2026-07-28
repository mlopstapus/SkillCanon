import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { SESSION_COOKIE_NAME } from "../domain/session";
import * as jwtModule from "../infrastructure/jwt";
import { signSessionJwt } from "../infrastructure/jwt";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { update as updateUserRow } from "../infrastructure/users-repo";
import { insertValidatedUser } from "./insert-validated-user";
import { authenticateSession } from "./authenticate-session";

async function makeOrgTeamUser(testDb: TestDb) {
  const { id: organizationId } = await insertOrg(testDb.authDb, {
    name: "Acme",
    slug: `acme-${randomUUID()}`,
  });
  const { id: teamId } = await insertTeam(testDb.authDb, {
    organizationId,
    name: "Root",
    slug: `root-${randomUUID()}`,
  });
  const { id: userId } = await insertValidatedUser(testDb.authDb, {
    organizationId,
    teamId,
    username: `jdoe-${randomUUID()}`,
    displayName: "Jane Doe",
    email: `jane-${randomUUID()}@example.com`,
    password: "correct-horse-battery",
    role: "member",
  });
  return { organizationId, teamId, userId };
}

describe("authenticateSession", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", "a-real-signing-secret-for-tests");
    vi.stubEnv("JWT_EXPIRY_HOURS", "24");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("resolves a valid cookie header to the user's current UserSummary, sourced live not from JWT claims", async () => {
    const { organizationId, teamId, userId } = await makeOrgTeamUser(testDb);
    const token = await signSessionJwt({ sub: userId, role: "member" });
    const cookieHeader = `${SESSION_COOKIE_NAME}=${token}`;

    await updateUserRow(testDb.authDb, userId, { role: "admin" });

    const resolved = await authenticateSession(testDb.authDb, cookieHeader);

    expect(resolved).toEqual({
      id: userId,
      orgId: organizationId,
      teamId,
      role: "admin", // reflects the live row, not the JWT's original "member" claim
      email: resolved?.email,
      displayName: "Jane Doe",
      teamName: "Root",
    });
  });

  it("resolves null when a previously authenticated user has been deactivated", async () => {
    const { userId } = await makeOrgTeamUser(testDb);
    const token = await signSessionJwt({ sub: userId, role: "member" });

    await updateUserRow(testDb.authDb, userId, { isActive: false });

    await expect(
      authenticateSession(testDb.authDb, `${SESSION_COOKIE_NAME}=${token}`),
    ).resolves.toBeNull();
  });

  it("resolves a session with teamId/teamName null for a user unassigned from every team (019-account-team-settings-ui)", async () => {
    const { organizationId, userId } = await makeOrgTeamUser(testDb);
    const token = await signSessionJwt({ sub: userId, role: "member" });

    await updateUserRow(testDb.authDb, userId, { teamId: null });

    const resolved = await authenticateSession(
      testDb.authDb,
      `${SESSION_COOKIE_NAME}=${token}`,
    );

    expect(resolved).toEqual({
      id: userId,
      orgId: organizationId,
      teamId: null,
      role: "member",
      email: resolved?.email,
      displayName: "Jane Doe",
      teamName: null,
    });
  });

  it("resolves null when the user's current team belongs to a different organization", async () => {
    const { userId } = await makeOrgTeamUser(testDb);
    const { id: otherOrgId } = await insertOrg(testDb.authDb, {
      name: "Other Org",
      slug: `other-${randomUUID()}`,
    });
    const { id: otherTeamId } = await insertTeam(testDb.authDb, {
      organizationId: otherOrgId,
      name: "Other Root",
      slug: `other-root-${randomUUID()}`,
    });
    const token = await signSessionJwt({ sub: userId, role: "member" });

    await updateUserRow(testDb.authDb, userId, { teamId: otherTeamId });

    await expect(
      authenticateSession(testDb.authDb, `${SESSION_COOKIE_NAME}=${token}`),
    ).resolves.toBeNull();
  });

  it("resolves null for an expired token", async () => {
    // Real expiry mechanics are already covered by jwt.test.ts's unit tests
    // (fake timers + Testcontainers DB I/O don't mix reliably); here we only
    // need to confirm authenticateSession treats a verification failure as
    // "no user," which is exactly what an expired token produces.
    vi.spyOn(jwtModule, "verifySessionJwt").mockResolvedValueOnce(null);

    const resolved = await authenticateSession(
      testDb.authDb,
      `${SESSION_COOKIE_NAME}=some-token`,
    );

    expect(resolved).toBeNull();
  });

  it("resolves null for a tampered token", async () => {
    const { userId } = await makeOrgTeamUser(testDb);
    const token = await signSessionJwt({ sub: userId, role: "member" });
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "b" : "a");

    const resolved = await authenticateSession(
      testDb.authDb,
      `${SESSION_COOKIE_NAME}=${tampered}`,
    );

    expect(resolved).toBeNull();
  });

  it("resolves null for null/undefined/empty cookie headers", async () => {
    expect(await authenticateSession(testDb.authDb, null)).toBeNull();
    expect(await authenticateSession(testDb.authDb, undefined)).toBeNull();
    expect(await authenticateSession(testDb.authDb, "")).toBeNull();
  });

  it("resolves null when the cookie header lacks this feature's session-cookie name", async () => {
    const resolved = await authenticateSession(
      testDb.authDb,
      "some_other_cookie=value",
    );

    expect(resolved).toBeNull();
  });
});
