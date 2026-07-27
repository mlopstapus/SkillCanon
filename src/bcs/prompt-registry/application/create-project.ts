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
  DuplicateProjectNameError,
  DuplicateProjectSlugError,
  ProjectOrganizationNotFoundError,
  ProjectTeamNotFoundError,
  ProjectUserNotFoundError,
  type CreateProjectParams,
  type ProjectActor,
  type ProjectIdentityVerifier,
} from "../domain/project";
import { findByOrgAndName, findByOrgAndSlug, insert } from "../infrastructure/projects-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

function constraintName(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const direct = (err as { constraint_name?: unknown; constraint?: unknown }).constraint_name ??
    (err as { constraint?: unknown }).constraint;
  if (typeof direct === "string") return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null) {
    return (cause as { constraint_name?: string; constraint?: string }).constraint_name ??
      (cause as { constraint?: string }).constraint;
  }
  return undefined;
}

function translateProjectUniqueError(err: unknown, params: CreateProjectParams): never {
  const constraint = constraintName(err);
  if (constraint?.includes("slug")) {
    throw new DuplicateProjectSlugError(params.slug);
  }
  if (constraint?.includes("name")) {
    throw new DuplicateProjectNameError(params.name);
  }
  if (isUniqueViolation(err)) {
    throw new DuplicateProjectSlugError(params.slug);
  }
  throw err;
}

async function assertCreateProjectReferences(
  actor: ProjectActor,
  params: CreateProjectParams,
  verifier: ProjectIdentityVerifier,
): Promise<void> {
  if (actor.organizationId !== params.organizationId) {
    throw new ProjectOrganizationNotFoundError(params.organizationId);
  }
  if (!(await verifier.organizationExists(params.organizationId))) {
    throw new ProjectOrganizationNotFoundError(params.organizationId);
  }
  if (!(await verifier.teamBelongsToOrganization(params.organizationId, params.teamId))) {
    throw new ProjectTeamNotFoundError(params.teamId);
  }
  if (
    params.leadUserId &&
    !(await verifier.userBelongsToOrganization(params.organizationId, params.leadUserId))
  ) {
    throw new ProjectUserNotFoundError(params.leadUserId);
  }
}

export async function createProject(
  db: Db,
  actor: ProjectActor,
  params: CreateProjectParams,
  verifier: ProjectIdentityVerifier,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  await assertCreateProjectReferences(actor, params, verifier);
  if (await findByOrgAndName(db, params.organizationId, params.name)) {
    throw new DuplicateProjectNameError(params.name);
  }
  if (await findByOrgAndSlug(db, params.organizationId, params.slug)) {
    throw new DuplicateProjectSlugError(params.slug);
  }

  const id = randomUUID();
  const values = {
    id,
    organizationId: params.organizationId,
    teamId: params.teamId,
    leadUserId: params.leadUserId ?? null,
    name: params.name,
    slug: params.slug,
    description: params.description ?? null,
  };

  try {
    return await withAudit(
      db,
      (tx) => insert(tx, values),
      (tx) =>
        record(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          actorApiKeyId: null,
          action: "project.created",
          resourceType: "project",
          resourceId: id,
          before: null,
          after: values,
          transport: auditContext.transport,
          sourceIp: auditContext.sourceIp ?? null,
        }),
    );
  } catch (err) {
    return translateProjectUniqueError(err, params);
  }
}
