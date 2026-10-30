import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NotAuthorizedError } from "@/bcs/identity-access";
import { createPrompt, publishVersion, type PromptActor } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { FeedbackNotFoundError, FeedbackVersionMismatchError } from "../domain/feedback";
import { fileFeedback } from "./file-feedback";
import { getDownRates } from "./get-down-rates";
import { listFeedbackForSkill } from "./list-feedback-for-skill";
import { markFeedbackAddressed } from "./mark-feedback-addressed";
import { recordPromptUsage } from "./record-prompt-usage";

describe("feedback listing, down-rates and triage", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(() => {
    vi.stubEnv("STRIPE_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const inOrg = <T,>(seeded: SeededOrg, fn: (tx: typeof testDb.appDb) => Promise<T>) =>
    withTenantContext(testDb.appDb, seeded.organizationId, fn);

  async function skillWithVersions(seeded: SeededOrg, labels: string[]) {
    const actor: PromptActor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    const name = `skill-${randomUUID()}`;
    return inOrg(seeded, async (tx) => {
      const prompt = await createPrompt(tx, actor, { organizationId: seeded.organizationId, name });
      const versions = [];
      for (const version of labels) {
        versions.push(
          await publishVersion(tx, actor, {
            organizationId: seeded.organizationId,
            promptName: name,
            version,
            mainFile: { content: `Body ${version}` },
          }),
        );
      }
      return { promptId: prompt.id, versions };
    });
  }

  async function serve(seeded: SeededOrg, promptId: string, version: { id: string; version: string }) {
    return inOrg(seeded, (tx) =>
      recordPromptUsage(tx, {
        organizationId: seeded.organizationId,
        promptId,
        promptVersionId: version.id,
        promptVersion: version.version,
        userId: seeded.adminUserId,
        contentDigest: "d".repeat(64),
      }),
    );
  }

  const file = (seeded: SeededOrg, serveId: string, params: { kind: "signal" | "note"; rating?: "up" | "down"; text?: string }) =>
    inOrg(seeded, (tx) => fileFeedback(tx, { organizationId: seeded.organizationId, userId: seeded.adminUserId }, { serveId, ...params }));

  it("counts up/down/notes per version and lists notes newest first, scoped to the skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { promptId, versions } = await skillWithVersions(seeded, ["1", "2"]);
    const other = await skillWithVersions(seeded, ["1"]);
    const [s1, s2, otherServe] = [
      await serve(seeded, promptId, versions[0]!),
      await serve(seeded, promptId, versions[1]!),
      await serve(seeded, other.promptId, other.versions[0]!),
    ];
    await file(seeded, s1, { kind: "signal", rating: "down" });
    await file(seeded, s1, { kind: "note", text: "first note" });
    await file(seeded, s2, { kind: "note", rating: "up", text: "second note" });
    await file(seeded, otherServe, { kind: "signal", rating: "down" });

    const summary = await inOrg(seeded, (tx) => listFeedbackForSkill(tx, seeded.organizationId, promptId));

    expect(summary.byVersion.map(({ version, up, down, notes }) => ({ version, up, down, notes }))).toEqual([
      { version: "2", up: 1, down: 0, notes: 1 },
      { version: "1", up: 0, down: 1, notes: 1 },
    ]);
    expect(summary.notes.map((n) => n.text)).toEqual(["second note", "first note"]);
    expect(summary.notes[0]).toMatchObject({ serveId: s2, version: "2", addressedAt: null });
  });

  it("computes the down-rate per version, null when nothing is rated", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { promptId, versions } = await skillWithVersions(seeded, ["1", "2"]);
    const s1 = await serve(seeded, promptId, versions[0]!);
    for (const rating of ["down", "up", "up", "up"] as const) await file(seeded, s1, { kind: "signal", rating });

    const rates = await inOrg(seeded, (tx) =>
      getDownRates(tx, seeded.organizationId, [versions[0]!.id, versions[1]!.id]),
    );

    expect(rates.get(versions[0]!.id)).toEqual({ up: 3, down: 1, rate: 0.25 });
    expect(rates.get(versions[1]!.id)).toEqual({ up: 0, down: 0, rate: null });
  });

  it("lets the owner mark a note addressed by a version of the same skill, and audits it", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { promptId, versions } = await skillWithVersions(seeded, ["1", "2"]);
    const s1 = await serve(seeded, promptId, versions[0]!);
    const note = await file(seeded, s1, { kind: "note", text: "fix the intro" });
    const owner = { organizationId: seeded.organizationId, userId: seeded.adminUserId, role: "admin" as const };

    await inOrg(seeded, (tx) => markFeedbackAddressed(tx, owner, note.id, versions[1]!.id));

    const summary = await inOrg(seeded, (tx) => listFeedbackForSkill(tx, seeded.organizationId, promptId));
    expect(summary.notes[0]).toMatchObject({ addressedInVersionId: versions[1]!.id });
    expect(summary.notes[0]?.addressedAt).toBeInstanceOf(Date);
    const audits = Array.from(
      await testDb.ownerDb.execute(
        sql`select 1 from audit.audit_events where organization_id = ${seeded.organizationId} and action = 'feedback.updated' and resource_id = ${note.id}`,
      ),
    );
    expect(audits).toHaveLength(1);
  });

  it("rejects a non-owner, a version of another skill, and a note from another organization", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { promptId, versions } = await skillWithVersions(seeded, ["1"]);
    const other = await skillWithVersions(seeded, ["1"]);
    const note = await file(seeded, await serve(seeded, promptId, versions[0]!), { kind: "note", text: "hmm" });
    const stranger = { organizationId: seeded.organizationId, userId: randomUUID(), role: "member" as const };
    const owner = { organizationId: seeded.organizationId, userId: seeded.adminUserId, role: "admin" as const };

    await expect(inOrg(seeded, (tx) => markFeedbackAddressed(tx, stranger, note.id, versions[0]!.id))).rejects.toBeInstanceOf(
      NotAuthorizedError,
    );
    await expect(
      inOrg(seeded, (tx) => markFeedbackAddressed(tx, owner, note.id, other.versions[0]!.id)),
    ).rejects.toBeInstanceOf(FeedbackVersionMismatchError);

    const foreign = await seedOrgWithAdmin(testDb.authDb);
    const foreignOwner = { organizationId: foreign.organizationId, userId: foreign.adminUserId, role: "admin" as const };
    await expect(
      inOrg(foreign, (tx) => markFeedbackAddressed(tx, foreignOwner, note.id, versions[0]!.id)),
    ).rejects.toBeInstanceOf(FeedbackNotFoundError);
  });
});
