import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import type { UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import { CannotForkOwnSkillError, SourceSkillNotFoundError, type ForkSkillParams } from "../domain/subscription";
import { insertFiles, type InsertPromptVersionFileParams } from "../infrastructure/prompt-version-files-repo";
import { findPromptByOrgAndId, insertPrompt, updatePrompt } from "../infrastructure/prompts-repo";
import { findVersionById, insertPromptVersion } from "../infrastructure/prompt-versions-repo";
import { assertAuthorizedForOwner } from "./authorize-owner-action";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Creates a fully independent copy of the source skill's *current* active
 * version under a new owner, stamped with a permanent `forkedFromSkillId`
 * lineage pointer. No column, flag, or background job ever links the two
 * versions after this point — the fork never re-syncs with its source, in
 * either direction, ever again (FR-010, research.md's "enforced by
 * construction" decision).
 */
export async function forkSkill(
  db: Db,
  actingUser: UserSummary,
  sourceSkillId: string,
  params: ForkSkillParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const source = await findPromptByOrgAndId(db, actingUser.orgId, sourceSkillId);
  if (!source) {
    throw new SourceSkillNotFoundError();
  }

  if (source.ownerType === params.ownerType && source.ownerId === params.ownerId) {
    throw new CannotForkOwnSkillError();
  }

  await assertAuthorizedForOwner(db, actingUser, params.ownerType, params.ownerId);

  const sourceVersion = source.activeVersionId
    ? await findVersionById(db, source.activeVersionId)
    : null;

  const newPromptId = randomUUID();
  const newVersionId = randomUUID();
  const promptValues = {
    id: newPromptId,
    organizationId: actingUser.orgId,
    name: `${source.name}-fork-${newPromptId.slice(0, 8)}`,
    description: source.description,
    isDeprecated: false,
    activeVersionId: null,
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    forkedFromSkillId: sourceSkillId,
  };

  return withAudit(
    db,
    async (tx) => {
      const inserted = await insertPrompt(tx, promptValues);
      if (!sourceVersion) {
        return inserted;
      }

      await insertPromptVersion(tx, {
        id: newVersionId,
        promptId: newPromptId,
        version: "v1",
        kind: sourceVersion.kind,
        // New-shape source (has files): copy them verbatim below instead.
        // Legacy-shape source: copy its system/user template columns
        // unchanged — forking follows whichever shape the source version
        // is already in (032-skill-file-format-refactor), no reshaping.
        systemTemplate: sourceVersion.files.length > 0 ? null : sourceVersion.systemTemplate,
        userTemplate: sourceVersion.files.length > 0 ? null : sourceVersion.userTemplate,
        steps: sourceVersion.steps,
        tags: sourceVersion.tags as string[],
      });
      if (sourceVersion.files.length > 0) {
        const fileRows: InsertPromptVersionFileParams[] = sourceVersion.files.map((f) => ({
          id: randomUUID(),
          promptVersionId: newVersionId,
          name: f.name,
          content: f.content,
          isMain: f.isMain,
        }));
        await insertFiles(tx, fileRows);
      }
      const updated = await updatePrompt(tx, newPromptId, { activeVersionId: newVersionId });
      return updated ?? inserted;
    },
    (tx) =>
      record(tx, {
        organizationId: actingUser.orgId,
        actorUserId: actingUser.id,
        actorApiKeyId: null,
        action: "skill.forked",
        resourceType: "prompt",
        resourceId: newPromptId,
        before: null,
        after: { ...promptValues, activeVersionId: sourceVersion ? newVersionId : null },
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
