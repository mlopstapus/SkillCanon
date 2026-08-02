import { z } from "zod";
import { addProjectMember, getProject, listProjectMembers } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";
import { makeProjectIdentityVerifier } from "../../project-identity-verifier";

interface Params {
  projectId: string;
}

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.string().optional(),
});

/** `addProjectMember` throws the registered `ProjectNotFoundError`/`ProjectUserNotFoundError`/`DuplicateProjectMemberError` — flows through `mapError` normally. */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = addMemberSchema.parse(await request.json());
  const actor = { organizationId: caller.organizationId, userId: caller.actingUser.id };
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    addProjectMember(
      tx,
      actor,
      { projectId: params.projectId, userId: body.userId, role: body.role },
      makeProjectIdentityVerifier(tx),
      caller.auditContext,
    ),
  );
  return Response.json(result, { status: 201 });
}

/**
 * `listProjectMembers` silently returns `[]` for a nonexistent/cross-org
 * project (no throw, no `null`) — a fourth "not found" shape beyond
 * research.md's documented three. An explicit `getProject` check is added
 * here so this GET returns the same 404 `PROJECT_NOT_FOUND` every sibling
 * `/api/projects/{id}/*` route already does for a bad project id (FR-014
 * consistency), rather than silently returning an empty list.
 */
export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const result = await withTenantContext(db, caller.organizationId, async (tx) => {
    const project = await getProject(tx, caller.organizationId, params.projectId);
    if (!project) {
      return null;
    }
    return listProjectMembers(tx, caller.organizationId, params.projectId);
  });

  if (result === null) {
    const mapped = notFoundResponse("PROJECT_NOT_FOUND", "Project not found");
    return Response.json(mapped.body, { status: mapped.status });
  }
  return Response.json(result);
}

export const POST = withApiRoute<Params>(handlePost);
export const GET = withApiRoute<Params>(handleGet);
