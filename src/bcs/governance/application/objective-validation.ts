import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  assertValidObjectiveTitle,
  ObjectiveCycleError,
  ObjectiveParentNotFoundError,
  ObjectiveScopeNotFoundError,
  type CreateObjectiveParams,
  type ObjectiveScopeVerifier,
  type UpdateObjectiveFields,
} from "../domain/objective";
import { findByOrgAndId } from "../infrastructure/objectives-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function assertObjectiveScopesBelongToOrganization(
  organizationId: string,
  fields: CreateObjectiveParams | UpdateObjectiveFields,
  scopeVerifier: ObjectiveScopeVerifier,
): Promise<void> {
  if (fields.title !== undefined) {
    assertValidObjectiveTitle(fields.title);
  }

  if (fields.teamId != null) {
    const belongs = await scopeVerifier.teamBelongsToOrganization?.(organizationId, fields.teamId);
    if (!belongs) {
      throw new ObjectiveScopeNotFoundError();
    }
  }

  if (fields.projectId != null) {
    const belongs = await scopeVerifier.projectBelongsToOrganization?.(organizationId, fields.projectId);
    if (!belongs) {
      throw new ObjectiveScopeNotFoundError();
    }
  }

  if (fields.userId != null) {
    const belongs = await scopeVerifier.userBelongsToOrganization?.(organizationId, fields.userId);
    if (!belongs) {
      throw new ObjectiveScopeNotFoundError();
    }
  }
}

export async function assertParentObjectiveCanBeUsed(
  tx: Db,
  organizationId: string,
  objectiveId: string,
  parentObjectiveId: string | null | undefined,
): Promise<void> {
  if (parentObjectiveId == null) {
    return;
  }

  if (parentObjectiveId === objectiveId) {
    throw new ObjectiveCycleError();
  }

  let currentId: string | null = parentObjectiveId;
  const seen = new Set<string>();

  while (currentId) {
    if (currentId === objectiveId || seen.has(currentId)) {
      throw new ObjectiveCycleError();
    }
    seen.add(currentId);

    const current = await findByOrgAndId(tx, organizationId, currentId);
    if (!current) {
      throw new ObjectiveParentNotFoundError(currentId);
    }
    currentId = current.parentObjectiveId;
  }
}
