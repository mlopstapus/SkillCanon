import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, record, type AuditContext } from "@/bcs/audit-compliance";
import { getEvalsEnabled, getPromptById, getPromptVersion, listVersions, publishVersion } from "@/bcs/prompt-registry";
import { withAudit } from "@/shared/db";
import {
  DRAFT_TIMEOUT_MS,
  DraftFailedError,
  DraftNotDraftableError,
  DraftNotFoundError,
  DraftNotPendingError,
  DraftingUnavailableError,
  MAX_DRAFT_CONTEXT_CHARS,
  MAX_DRAFT_NOTES,
  nextVersionLabel,
  type ImprovementDraft,
  type ImprovementDrafter,
} from "../domain/improvement-draft";
import { listForPrompt } from "../infrastructure/feedback-repo";
import {
  decideDraft,
  findDraft,
  insertDraft,
  listDraftsForPrompt,
  markNotesAddressed,
} from "../infrastructure/feedback-drafts-repo";
import { assertCanTriageSkill, type FeedbackTriager } from "./assert-can-triage-skill";

type Db = PostgresJsDatabase<Record<string, never>>;

export function listImprovementDrafts(db: Db, organizationId: string, promptId: string) {
  return listDraftsForPrompt(db, organizationId, promptId);
}

/**
 * Drafts an improvement of one version from its open (unaddressed) notes and
 * stores it as pending. Refused — nothing stored — when no provider is
 * configured, the organization has not opted in, the version is not a
 * template with a main file, or there are no open notes. A model failure or
 * timeout surfaces as `DraftFailedError` and stores nothing.
 */
export async function requestImprovementDraft(
  db: Db,
  actor: FeedbackTriager,
  versionId: string,
  drafter: ImprovementDrafter | null,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<ImprovementDraft> {
  const version = await getPromptVersion(db, actor.organizationId, versionId);
  if (!version) throw new DraftNotDraftableError("the version was not found.");
  const prompt = await getPromptById(db, actor.organizationId, version.promptId);
  if (!prompt) throw new DraftNotDraftableError("the skill was not found.");
  await assertCanTriageSkill(db, actor, prompt);

  if (!drafter) throw new DraftingUnavailableError("no model provider is configured.");
  if (!(await getEvalsEnabled(db, actor.organizationId))) {
    throw new DraftingUnavailableError("an admin has not allowed sending skill text to the model provider.");
  }
  const mainFile = version.kind === "template" ? version.files.find((f) => f.isMain) : undefined;
  if (!mainFile) throw new DraftNotDraftableError("only template skills with a main file can be drafted.");

  const notes = (await listForPrompt(db, actor.organizationId, prompt.id))
    .filter((n) => n.versionId === version.id && n.kind === "note" && n.addressedAt === null && n.text)
    .reverse()
    .slice(0, MAX_DRAFT_NOTES);
  if (notes.length === 0) throw new DraftNotDraftableError("this version has no open notes.");
  const noteTexts = notes.map((n) => n.text as string);
  if (mainFile.content.length + noteTexts.join("").length > MAX_DRAFT_CONTEXT_CHARS) {
    throw new DraftNotDraftableError("the skill and its notes are too large to send in one request.");
  }

  let drafted;
  try {
    drafted = await drafter.draft(
      { skillName: prompt.name, currentContent: mainFile.content, notes: noteTexts },
      AbortSignal.timeout(DRAFT_TIMEOUT_MS),
    );
  } catch (err) {
    if (err instanceof DraftFailedError) throw err;
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new DraftFailedError(timedOut ? "the request timed out." : "the provider request failed.");
  }

  const draftId = randomUUID();
  return withAudit(
    db,
    (tx) =>
      insertDraft(tx, {
        id: draftId,
        organizationId: actor.organizationId,
        promptId: prompt.id,
        baseVersionId: version.id,
        proposedContent: drafted.content,
        rationale: drafted.rationale,
        sourceFeedbackIds: notes.map((n) => n.id),
        model: drafter.model,
        createdBy: actor.userId,
      }),
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "feedback_draft.created",
        resourceType: "feedback_draft",
        resourceId: draftId,
        before: null,
        after: { promptId: prompt.id, baseVersionId: version.id, noteCount: notes.length, model: drafter.model },
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}

async function loadPendingDraft(db: Db, actor: FeedbackTriager, draftId: string) {
  const draft = await findDraft(db, actor.organizationId, draftId);
  if (!draft) throw new DraftNotFoundError(draftId);
  const prompt = await getPromptById(db, actor.organizationId, draft.promptId);
  if (!prompt) throw new DraftNotFoundError(draftId);
  await assertCanTriageSkill(db, actor, prompt);
  if (draft.status !== "pending") throw new DraftNotPendingError(draft.status);
  return { draft, prompt };
}

/**
 * Accepts a pending draft: publishes its proposed main file as the next
 * version through the normal `publishVersion` path (supporting files carried
 * over), marks the source notes addressed by it, and records the decision.
 * Returns the new version label.
 */
export async function acceptImprovementDraft(
  db: Db,
  actor: FeedbackTriager,
  draftId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<string> {
  const { draft, prompt } = await loadPendingDraft(db, actor, draftId);
  const base = await getPromptVersion(db, actor.organizationId, draft.baseVersionId);
  const label = nextVersionLabel((await listVersions(db, { organizationId: actor.organizationId, userId: actor.userId }, prompt.name)).map((v) => v.version));

  const published = await publishVersion(
    db,
    { organizationId: actor.organizationId, userId: actor.userId },
    {
      organizationId: actor.organizationId,
      promptName: prompt.name,
      version: label,
      mainFile: { content: draft.proposedContent },
      supportingFiles: (base?.files ?? []).filter((f) => !f.isMain).map((f) => ({ name: f.name, content: f.content })),
    },
    auditContext,
  );

  await withAudit(
    db,
    async (tx) => {
      await decideDraft(tx, actor.organizationId, draft.id, "accepted", actor.userId, published.id);
      await markNotesAddressed(tx, actor.organizationId, draft.sourceFeedbackIds, published.id);
    },
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "feedback_draft.accepted",
        resourceType: "feedback_draft",
        resourceId: draft.id,
        before: null,
        after: { acceptedVersionId: published.id, version: label },
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
  return label;
}

export async function dismissImprovementDraft(
  db: Db,
  actor: FeedbackTriager,
  draftId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<void> {
  const { draft } = await loadPendingDraft(db, actor, draftId);
  await withAudit(
    db,
    (tx) => decideDraft(tx, actor.organizationId, draft.id, "dismissed", actor.userId, null),
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "feedback_draft.dismissed",
        resourceType: "feedback_draft",
        resourceId: draft.id,
        before: null,
        after: null,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
