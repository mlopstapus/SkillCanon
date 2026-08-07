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
  InvalidVersionFilesError,
  MAIN_FILE_NAME,
  MAX_FILE_SIZE_BYTES,
  MAX_SUPPORTING_FILES,
  PromptNotFoundError,
  type PromptActor,
  type PublishVersionFileInput,
  type PublishVersionParams,
} from "../domain/prompt";
import { insertFiles, type InsertPromptVersionFileParams } from "../infrastructure/prompt-version-files-repo";
import { findPromptByOrgAndName, updatePrompt } from "../infrastructure/prompts-repo";
import {
  findVersionByPromptAndLabel,
  insertPromptVersion,
} from "../infrastructure/prompt-versions-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

function byteLength(content: string): number {
  return Buffer.byteLength(content, "utf8");
}

/**
 * Validates a template-kind version's file bundle (FR-007): non-empty main
 * file, every file ≤ MAX_FILE_SIZE_BYTES, unique supporting-file names,
 * at most MAX_SUPPORTING_FILES supporting files. Throws
 * `InvalidVersionFilesError` naming the specific violation.
 */
function validateFileBundle(mainFile: { content: string }, supportingFiles: PublishVersionFileInput[]) {
  if (mainFile.content.length === 0) {
    throw new InvalidVersionFilesError("The main file (SKILL.md) must not be empty.");
  }
  if (byteLength(mainFile.content) > MAX_FILE_SIZE_BYTES) {
    throw new InvalidVersionFilesError(
      `The main file (SKILL.md) exceeds the maximum size of ${MAX_FILE_SIZE_BYTES} bytes.`,
    );
  }
  if (supportingFiles.length > MAX_SUPPORTING_FILES) {
    throw new InvalidVersionFilesError(
      `A version may have at most ${MAX_SUPPORTING_FILES} supporting files (got ${supportingFiles.length}).`,
    );
  }
  const seenNames = new Set<string>();
  for (const file of supportingFiles) {
    if (seenNames.has(file.name)) {
      throw new InvalidVersionFilesError(`Duplicate supporting file name "${file.name}".`);
    }
    seenNames.add(file.name);
    if (file.content.length === 0) {
      throw new InvalidVersionFilesError(`Supporting file "${file.name}" must not be empty.`);
    }
    if (byteLength(file.content) > MAX_FILE_SIZE_BYTES) {
      throw new InvalidVersionFilesError(
        `Supporting file "${file.name}" exceeds the maximum size of ${MAX_FILE_SIZE_BYTES} bytes.`,
      );
    }
  }
}

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

  // Exactly one of a main file or chain steps — never both, never
  // neither (FR-001/FR-004, PDR-017). `kind` is derived, never caller-supplied.
  const kind = determinePromptVersionKind(params);
  const supportingFiles = params.supportingFiles ?? [];
  if (kind === "template" && params.mainFile) {
    validateFileBundle(params.mainFile, supportingFiles);
  }

  const versionId = randomUUID();
  const versionValues = {
    id: versionId,
    promptId: prompt.id,
    version: params.version,
    kind,
    systemTemplate: null,
    userTemplate: null,
    steps: params.steps ?? null,
    tags: params.tags ?? [],
  };

  const fileRows: InsertPromptVersionFileParams[] =
    kind === "template" && params.mainFile
      ? [
          { id: randomUUID(), promptVersionId: versionId, name: MAIN_FILE_NAME, content: params.mainFile.content, isMain: true },
          ...supportingFiles.map((f) => ({
            id: randomUUID(),
            promptVersionId: versionId,
            name: f.name,
            content: f.content,
            isMain: false,
          })),
        ]
      : [];

  try {
    const newVersion = await withAudit(
      db,
      async (tx) => {
        const inserted = await insertPromptVersion(tx, versionValues);
        await insertFiles(tx, fileRows);
        // Advance the prompt's active version to the newly published one.
        await updatePrompt(tx, prompt.id, { activeVersionId: versionId });
        return { ...inserted, files: fileRows.map(({ id, name, content, isMain }) => ({ id, name, content, isMain })) };
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
          after: { ...versionValues, fileCount: fileRows.length },
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
