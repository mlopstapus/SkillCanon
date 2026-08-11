/**
 * 013-skill-import-and-external-registries/002, spec
 * 037-local-folder-skill-upload. Tests `runLocalSkillImportBatch` directly
 * (an already-resolved actor, no cookies/`next/headers()` involved) —
 * proves User Story 3's per-skill isolation actually holds, rather than
 * relying on code inspection alone (a real gap `/speckit-analyze` found in
 * the sibling `001` feature's equivalent, untested loop).
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrompt } from "@/bcs/prompt-registry";
import type { LocalSkillCandidate } from "@/bcs/prompt-registry";
import { runLocalSkillImportBatch } from "./actions";

function candidate(name: string): LocalSkillCandidate {
  return {
    name,
    description: `Description for ${name}.`,
    mainFile: { name: "SKILL.md", content: `---\nname: ${name}\n---\nBody` },
    supportingFiles: [],
    folderPath: name,
  };
}

/**
 * A minimal org/team/user fixture built with raw SQL rather than importing
 * `prompt-registry`'s internal `prompt-test-helpers.ts` — this test file
 * lives outside the bounded context (`src/app/(app)/prompts/`, the
 * composition-root for `runLocalSkillImportBatch`), and `eslint-plugin-
 * boundaries` correctly blocks importing a BC's non-barrel-exported
 * internals from outside it, same as any other cross-boundary import.
 */
async function makeFixtureOrg(testDb: TestDb) {
  const organizationId = randomUUID();
  const teamId = randomUUID();
  const actorUserId = randomUUID();
  const orgSlug = `org-${randomUUID()}`;

  await testDb.ownerDb.execute(sql`
    insert into identity_access.organizations (id, name, slug)
    values (${organizationId}, ${`Org ${orgSlug}`}, ${orgSlug})
  `);
  await testDb.ownerDb.execute(sql`
    insert into identity_access.teams (id, organization_id, name, slug)
    values (${teamId}, ${organizationId}, 'Root', ${`team-${randomUUID()}`})
  `);
  await testDb.ownerDb.execute(sql`
    insert into identity_access.users (id, organization_id, team_id, username, display_name, email, role, is_active)
    values (${actorUserId}, ${organizationId}, ${teamId}, ${`user-${randomUUID()}`}, 'Actor', ${`${randomUUID()}@example.com`}, 'admin', true)
  `);

  return {
    organizationId,
    actor: { organizationId, userId: actorUserId },
  };
}

describe("runLocalSkillImportBatch", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates every skill in a batch when none collide", async () => {
    const fixture = await makeFixtureOrg(testDb);
    const actingUser = { id: fixture.actor.userId, orgId: fixture.organizationId };

    const result = await runLocalSkillImportBatch(actingUser, [candidate("skill-a"), candidate("skill-b")], testDb.appDb);

    expect(result.imported.sort()).toEqual(["skill-a", "skill-b"]);
    expect(result.failed).toEqual([]);
  });

  it("isolates one existing-name collision without affecting the rest of the batch (FR-006/FR-007/SC-003)", async () => {
    const fixture = await makeFixtureOrg(testDb);
    const actingUser = { id: fixture.actor.userId, orgId: fixture.organizationId };

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createPrompt(tx, fixture.actor, { organizationId: fixture.organizationId, name: "already-exists" }),
    );

    const result = await runLocalSkillImportBatch(
      actingUser,
      [candidate("unique-one"), candidate("already-exists"), candidate("unique-two")],
      testDb.appDb,
    );

    expect(result.imported.sort()).toEqual(["unique-one", "unique-two"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.name).toBe("already-exists");
    expect(result.failed[0]?.error).toMatch(/already exists/i);
  });
});
