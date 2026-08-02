import { z } from "zod";
import { deleteProject, getProject, updateProject } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";
import { makeProjectIdentityVerifier } from "../project-identity-verifier";

interface Params {
  projectId: string;
}

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  leadUserId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

/** `getProject` returns `null` for "not found" — converted to `notFoundResponse` per research.md. */
export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const project = await withTenantContext(db, caller.organizationId, (tx) =>
    getProject(tx, caller.organizationId, params.projectId),
  );
  if (!project) {
    const mapped = notFoundResponse("PROJECT_NOT_FOUND", "Project not found");
    return Response.json(mapped.body, { status: mapped.status });
  }
  return Response.json(project);
}

/**
 * `updateProject` throws the registered `ProjectNotFoundError` for a
 * nonexistent/cross-org id — flows through `mapError` normally, no
 * special-casing needed. `update-project.ts`'s real source has no
 * owner-team-admin authorization gate today (despite the contract doc's
 * wording) — the route does not invent one.
 */
export async function handlePut(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = updateProjectSchema.parse(await request.json());
  const actor = { organizationId: caller.organizationId, userId: caller.actingUser.id };
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    updateProject(tx, actor, params.projectId, body, makeProjectIdentityVerifier(tx), caller.auditContext),
  );
  return Response.json(result);
}

/** `deleteProject` throws the registered `ProjectNotFoundError` for a nonexistent/cross-org id. */
export async function handleDelete(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const actor = { organizationId: caller.organizationId, userId: caller.actingUser.id };
  await withTenantContext(db, caller.organizationId, (tx) =>
    deleteProject(tx, actor, params.projectId, caller.auditContext),
  );
  return new Response(null, { status: 204 });
}

export const GET = withApiRoute<Params>(handleGet);
export const PUT = withApiRoute<Params>(handlePut);
export const DELETE = withApiRoute<Params>(handleDelete);
