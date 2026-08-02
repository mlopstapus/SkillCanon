import { z } from "zod";
import { createObjective, listProjectObjectives, type ObjectiveScopeVerifier } from "@/bcs/governance";
import { getProject } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  projectId: string;
}

const createObjectiveSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  parentObjectiveId: z.string().optional(),
  status: z.string().optional(),
});

/**
 * A minimal `ObjectiveScopeVerifier` for this project-nested route — only
 * `projectId` is ever set on the body (the route always fixes it to the
 * URL's `projectId`, never accepting `teamId`/`userId` from the client), so
 * only `projectBelongsToOrganization` needs a real implementation. Delegates
 * to `prompt-registry`'s own exported `getProject` (D1: calls only what's
 * already exposed by that BC, no reach into its internals).
 */
function makeObjectiveScopeVerifier(tx: Db): ObjectiveScopeVerifier {
  return {
    projectBelongsToOrganization: async (organizationId, projectId) => {
      const project = await getProject(tx, organizationId, projectId);
      return Boolean(project);
    },
  };
}

/**
 * `createObjective` throws the registered `ObjectiveScopeNotFoundError` (via
 * the scope verifier above) for a nonexistent/cross-org `projectId` — flows
 * through `mapError` normally as `404 OBJECTIVE_SCOPE_NOT_FOUND`, not
 * `PROJECT_NOT_FOUND` (governance's own registered class for this
 * situation, distinct from prompt-registry's).
 */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = createObjectiveSchema.parse(await request.json());
  const actor = { organizationId: caller.organizationId, userId: caller.actingUser.id };
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    createObjective(
      tx,
      actor,
      { ...body, projectId: params.projectId },
      makeObjectiveScopeVerifier(tx),
      caller.auditContext,
    ),
  );
  return Response.json(result, { status: 201 });
}

/**
 * `listProjectObjectives` performs no project-existence check on its own
 * (returns `[]` for a nonexistent/cross-org project) — an explicit
 * `getProject` lookup is added for the same 404 `PROJECT_NOT_FOUND`
 * consistency as every sibling `/api/projects/{id}/*` route.
 */
export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const actor = { organizationId: caller.organizationId, userId: caller.actingUser.id };
  const result = await withTenantContext(db, caller.organizationId, async (tx) => {
    const project = await getProject(tx, caller.organizationId, params.projectId);
    if (!project) {
      return null;
    }
    return listProjectObjectives(tx, actor, params.projectId);
  });

  if (result === null) {
    const mapped = notFoundResponse("PROJECT_NOT_FOUND", "Project not found");
    return Response.json(mapped.body, { status: mapped.status });
  }
  return Response.json(result);
}

export const POST = withApiRoute<Params>(handlePost);
export const GET = withApiRoute<Params>(handleGet);
