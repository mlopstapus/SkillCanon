import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { isUniqueViolation } from "@/shared/db/postgres-errors";
import {
  determinePromptVersionKind,
  DuplicatePromptVersionError,
  PromptNotFoundError,
  type PromptActor,
  type PublishVersionParams,
} from "../domain/prompt";
import { findPromptByOrgAndName, updatePrompt } from "../infrastructure/prompts-repo";
import {
  findVersionByPromptAndLabel,
  insertPromptVersion,
} from "../infrastructure/prompt-versions-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function publishVersion(
  db: Db,
  actor: PromptActor,
  params: PublishVersionParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const prompt = await findPromptByOrgAndName(db, actor.organizationId, params.promptName);
  if (!prompt) {
    throw new PromptNotFoundError(params.promptName);
  }

  // Check for duplicate version label on this prompt.
  const existing = await findVersionByPromptAndLabel(db, prompt.id, params.version);
  if (existing) {
    throw new DuplicatePromptVersionError(params.promptName, params.version);
  }

  // Exactly one of template content or chain steps — never both, never
  // neither (FR-001, PDR-017). `kind` is derived, never caller-supplied.
  const kind = determinePromptVersionKind(params);

  const versionId = randomUUID();
  const versionValues = {
    id: versionId,
    promptId: prompt.id,
    version: params.version,
    kind,
    systemTemplate: params.systemTemplate ?? null,
    userTemplate: params.userTemplate ?? null,
    steps: params.steps ?? null,
    inputSchema: params.inputSchema ?? {},
    tags: params.tags ?? [],
  };

  try {
    const newVersion = await withAudit(
      db,
      async (tx) => {
        const inserted = await insertPromptVersion(tx, versionValues);
        // Advance the prompt's active version to the newly published one.
        await updatePrompt(tx, prompt.id, { activeVersionId: versionId });
        return inserted;
      },
      (tx) =>
        record(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          actorApiKeyId: null,
          action: "prompt_version.published",
          resourceType: "prompt_version",
          resourceId: versionId,
          before: null,
          after: versionValues,
          transport: auditContext.transport,
          sourceIp: auditContext.sourceIp ?? null,
        }),
    );
    return newVersion;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicatePromptVersionError(params.promptName, params.version);
    }
    throw err;
  }
}
