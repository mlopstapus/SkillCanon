import { z } from "zod";
import { deleteObjective, getObjective, updateObjective } from "@/bcs/governance";
import type { ObjectiveScopeVerifier } from "@/bcs/governance";
import { getTeam, getUser } from "@/bcs/identity-access";
import { getProject } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  objectiveId: string;
}

const updateObjectiveSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  parentObjectiveId: z.string().nullable().optional(),
  status: z.string().optional(),
});

/** `getObjective` returns `null` for "not found" (not a thrown error) — data-model.md. */
export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const objective = await withTenantContext(db, caller.organizationId, (tx) =>
    getObjective(tx, { organizationId: caller.organizationId, userId: caller.actingUser.id }, params.objectiveId),
  );
  if (!objective) {
    const mapped = notFoundResponse("OBJECTIVE_NOT_FOUND", "Objective not found");
    return Response.json(mapped.body, { status: mapped.status });
  }
  return Response.json(objective);
}

/**
 * `updateObjective` throws the registered `ObjectiveNotFoundError` for a
 * missing/cross-org objective — flows through the shared mapper untouched.
 * Unlike policies, `UpdateObjectiveFields` can include `teamId`/`projectId`/
 * `userId`, so a scope verifier is required here too.
 */
export async function handlePut(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = updateObjectiveSchema.parse(await request.json());
  const actor = { organizationId: caller.organizationId, userId: caller.actingUser.id };

  const result = await withTenantContext(db, caller.organizationId, (tx) => {
    const verifier: ObjectiveScopeVerifier = {
      teamBelongsToOrganization: async (organizationId, teamId) => {
        try {
          await getTeam(tx, organizationId, teamId);
          return true;
        } catch {
          return false;
        }
      },
      projectBelongsToOrganization: async (organizationId, projectId) => {
        const project = await getProject(tx, organizationId, projectId);
        return project != null;
      },
      userBelongsToOrganization: async (organizationId, userId) => {
        try {
          await getUser(tx, userId, organizationId);
          return true;
        } catch {
          return false;
        }
      },
    };
    return updateObjective(tx, actor, params.objectiveId, body, verifier, caller.auditContext);
  });
  return Response.json(result);
}

/** `deleteObjective` (a hard delete) throws the registered `ObjectiveNotFoundError` for a missing/cross-org objective. */
export async function handleDelete(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  await withTenantContext(db, caller.organizationId, (tx) =>
    deleteObjective(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      params.objectiveId,
      caller.auditContext,
    ),
  );
  return new Response(null, { status: 204 });
}

export const GET = withApiRoute<Params>(handleGet);
export const PUT = withApiRoute<Params>(handlePut);
export const DELETE = withApiRoute<Params>(handleDelete);
