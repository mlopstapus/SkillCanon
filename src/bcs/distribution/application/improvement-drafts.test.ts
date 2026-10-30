import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NotAuthorizedError } from "@/bcs/identity-access";
import { createPrompt, getPromptVersion, listVersions, publishVersion, type PromptActor } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  DraftFailedError,
  DraftNotDraftableError,
  DraftNotPendingError,
  DraftingUnavailableError,
  lineDiff,
  nextVersionLabel,
  type ImprovementDrafter,
} from "../domain/improvement-draft";
import { createAnthropicDrafter, parseDraft } from "../infrastructure/anthropic-drafter";
import type { FeedbackTriager } from "./assert-can-triage-skill";
import { fileFeedback } from "./file-feedback";
import { listFeedbackForSkill } from "./list-feedback-for-skill";
import {
  acceptImprovementDraft,
  dismissImprovementDraft,
  listImprovementDrafts,
  requestImprovementDraft,
  setThirdPartyOptIn,
} from "./improvement-drafts";
import { recordPromptUsage } from "./record-prompt-usage";

const stubDrafter: ImprovementDrafter = {
  model: "stub/test-model",
  draft: async (input) => ({
    content: `${input.currentContent}\nAlways cite sources.`,
    rationale: `Addressed ${input.notes.length} note(s).`,
  }),
};

describe("pure helpers", () => {
  it("diffs lines and picks the next numeric label", () => {
    expect(lineDiff("a\nb\nc", "a\nc\nd")).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "same", text: "c" },
      { type: "add", text: "d" },
    ]);
    expect(nextVersionLabel(["1", "v2", "x"])).toBe("3");
    expect(nextVersionLabel([])).toBe("1");
  });

  it("parses bare or fenced JSON replies and rejects the rest", () => {
    expect(parseDraft('```json\n{"content":"new","rationale":"why"}\n```')).toEqual({ content: "new", rationale: "why" });
    expect(() => parseDraft("sorry, no")).toThrow(DraftFailedError);
    expect(() => parseDraft('{"content":"  "}')).toThrow(DraftFailedError);
  });
});

describe("Anthropic drafter", () => {
  it("posts the skill and notes with the key, parses the reply, and fails on an HTTP error", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ content: [{ type: "text", text: '{"content":"new file","rationale":"because"}' }] }),
    );
    const drafter = createAnthropicDrafter("sk-ant-test", "claude-test", fetchMock as unknown as typeof fetch);

    const result = await drafter.draft({ skillName: "s", currentContent: "old", notes: ["n1"] }, new AbortController().signal);

    expect(result).toEqual({ content: "new file", rationale: "because" });
    expect(drafter.model).toBe("anthropic/claude-test");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-test");
    expect(JSON.parse(init.body as string).messages[0].content).toContain("1. n1");

    const failing = createAnthropicDrafter("k", "m", (async () => new Response("no", { status: 529 })) as unknown as typeof fetch);
    await expect(failing.draft({ skillName: "s", currentContent: "o", notes: ["n"] }, new AbortController().signal)).rejects.toThrow(/HTTP 529/);
  });
});

describe("improvement drafts", () => {
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
  const admin = (seeded: SeededOrg): FeedbackTriager => ({ organizationId: seeded.organizationId, userId: seeded.adminUserId, role: "admin" });

  /** A skill with version 1 (main file + one supporting file) and two open notes against it. */
  async function skillWithNotes(seeded: SeededOrg) {
    const actor: PromptActor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    const name = `skill-${randomUUID()}`;
    return inOrg(seeded, async (tx) => {
      const prompt = await createPrompt(tx, actor, { organizationId: seeded.organizationId, name });
      const v1 = await publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: name,
        version: "1",
        mainFile: { content: "Be brief." },
        supportingFiles: [{ name: "example.md", content: "Example." }],
      });
      const serveId = await recordPromptUsage(tx, {
        organizationId: seeded.organizationId,
        promptId: prompt.id,
        promptVersionId: v1.id,
        promptVersion: "1",
        userId: seeded.adminUserId,
      });
      for (const text of ["Cite sources", "Too terse"]) {
        await fileFeedback(tx, { organizationId: seeded.organizationId, userId: seeded.adminUserId }, { serveId, kind: "note", text });
      }
      return { name, promptId: prompt.id, v1 };
    });
  }

  it("drafts from the open notes, stores it pending, then accept publishes the next version and addresses the notes", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { name, promptId, v1 } = await skillWithNotes(seeded);
    await inOrg(seeded, (tx) => setThirdPartyOptIn(tx, admin(seeded), true));

    const draft = await inOrg(seeded, (tx) => requestImprovementDraft(tx, admin(seeded), v1.id, stubDrafter));
    expect(draft).toMatchObject({ status: "pending", baseVersionId: v1.id, model: "stub/test-model", rationale: "Addressed 2 note(s)." });
    expect(draft.proposedContent).toBe("Be brief.\nAlways cite sources.");
    expect(draft.sourceFeedbackIds).toHaveLength(2);

    const label = await inOrg(seeded, (tx) => acceptImprovementDraft(tx, admin(seeded), draft.id));

    expect(label).toBe("2");
    const versions = await inOrg(seeded, (tx) => listVersions(tx, { organizationId: seeded.organizationId, userId: seeded.adminUserId }, name));
    const v2 = versions.find((v) => v.version === "2");
    const v2Full = await inOrg(seeded, (tx) => getPromptVersion(tx, seeded.organizationId, v2!.id));
    expect(v2Full?.files.map((f) => `${f.name}:${f.isMain}`).sort()).toEqual(["SKILL.md:true", "example.md:false"]);
    expect(v2Full?.files.find((f) => f.isMain)?.content).toBe("Be brief.\nAlways cite sources.");

    const summary = await inOrg(seeded, (tx) => listFeedbackForSkill(tx, seeded.organizationId, promptId));
    expect(summary.notes.every((n) => n.addressedInVersionId === v2!.id)).toBe(true);
    const [stored] = await inOrg(seeded, (tx) => listImprovementDrafts(tx, seeded.organizationId, promptId));
    expect(stored).toMatchObject({ status: "accepted", acceptedVersionId: v2!.id });

    const audits = Array.from(
      await testDb.ownerDb.execute<{ action: string }>(
        sql`select action from audit.audit_events where organization_id = ${seeded.organizationId} and action like 'feedback_draft.%' order by created_at`,
      ),
    ).map((r) => r.action);
    expect(audits).toEqual(["feedback_draft.created", "feedback_draft.accepted"]);
  });

  it("dismiss leaves the skill and its notes unchanged; a decided draft cannot be decided again", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { name, promptId, v1 } = await skillWithNotes(seeded);
    await inOrg(seeded, (tx) => setThirdPartyOptIn(tx, admin(seeded), true));
    const draft = await inOrg(seeded, (tx) => requestImprovementDraft(tx, admin(seeded), v1.id, stubDrafter));

    await inOrg(seeded, (tx) => dismissImprovementDraft(tx, admin(seeded), draft.id));

    const versions = await inOrg(seeded, (tx) => listVersions(tx, { organizationId: seeded.organizationId, userId: seeded.adminUserId }, name));
    expect(versions).toHaveLength(1);
    const summary = await inOrg(seeded, (tx) => listFeedbackForSkill(tx, seeded.organizationId, promptId));
    expect(summary.notes.every((n) => n.addressedAt === null)).toBe(true);
    await expect(inOrg(seeded, (tx) => acceptImprovementDraft(tx, admin(seeded), draft.id))).rejects.toBeInstanceOf(DraftNotPendingError);
  });

  it("refuses without a provider, without opt-in, for non-owners, with no open notes, and stores nothing on model failure", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { promptId, v1 } = await skillWithNotes(seeded);
    const request = (drafter: ImprovementDrafter | null, actor = admin(seeded)) =>
      inOrg(seeded, (tx) => requestImprovementDraft(tx, actor, v1.id, drafter));

    await expect(request(null)).rejects.toBeInstanceOf(DraftingUnavailableError);
    await expect(request(stubDrafter)).rejects.toThrow(/has not allowed/);
    await inOrg(seeded, (tx) => setThirdPartyOptIn(tx, admin(seeded), true));
    await expect(request(stubDrafter, { ...admin(seeded), userId: randomUUID(), role: "member" })).rejects.toBeInstanceOf(NotAuthorizedError);

    const failing: ImprovementDrafter = { model: "stub/fail", draft: async () => { throw new Error("boom"); } };
    await expect(request(failing)).rejects.toBeInstanceOf(DraftFailedError);
    expect(await inOrg(seeded, (tx) => listImprovementDrafts(tx, seeded.organizationId, promptId))).toHaveLength(0);

    // Accepting addresses the notes, leaving none open for a second draft.
    const draft = await request(stubDrafter);
    await inOrg(seeded, (tx) => acceptImprovementDraft(tx, admin(seeded), draft.id));
    await expect(request(stubDrafter)).rejects.toBeInstanceOf(DraftNotDraftableError);
  });

  it("only admins can change the opt-in; drafts are invisible across organizations", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const { promptId, v1 } = await skillWithNotes(seeded);
    await expect(
      inOrg(seeded, (tx) => setThirdPartyOptIn(tx, { ...admin(seeded), role: "member" }, true)),
    ).rejects.toBeInstanceOf(NotAuthorizedError);
    await inOrg(seeded, (tx) => setThirdPartyOptIn(tx, admin(seeded), true));
    await inOrg(seeded, (tx) => requestImprovementDraft(tx, admin(seeded), v1.id, stubDrafter));

    const other = await seedOrgWithAdmin(testDb.authDb);
    expect(await inOrg(other, (tx) => listImprovementDrafts(tx, other.organizationId, promptId))).toEqual([]);
  });
});
