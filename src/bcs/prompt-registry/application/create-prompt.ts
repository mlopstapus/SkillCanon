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
  DuplicatePromptNameError,
  PromptOwnerNotInOrganizationError,
  type CreatePromptParams,
  type PromptActor,
  type PromptIdentityVerifier,
} from "../domain/prompt";
import { findPromptByOrgAndName, insertPrompt } from "../infrastructure/prompts-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function createPrompt(
  db: Db,
  actor: PromptActor,
  params: CreatePromptParams,
  verifier: PromptIdentityVerifier,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  // Validate optional owner user belongs to the organization.
  if (
    params.userId &&
    !(await verifier.userBelongsToOrganization(params.organizationId, params.userId))
  ) {
    throw new PromptOwnerNotInOrganizationError(params.userId);
  }

  // Check for duplicate name within the org before attempting insert.
  if (await findPromptByOrgAndName(db, params.organizationId, params.name)) {
    throw new DuplicatePromptNameError(params.name);
  }

  const id = randomUUID();
  const values = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? null,
    isDeprecated: false,
    activeVersionId: null,
    userId: params.userId ?? null,
  };

  try {
    return await withAudit(
      db,
      (tx) => insertPrompt(tx, values),
      (tx) =>
        record(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          actorApiKeyId: null,
          action: "prompt.created",
          resourceType: "prompt",
          resourceId: id,
          before: null,
          after: values,
          transport: auditContext.transport,
          sourceIp: auditContext.sourceIp ?? null,
        }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicatePromptNameError(params.name);
    }
    throw err;
  }
}
