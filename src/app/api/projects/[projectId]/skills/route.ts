import { z } from "zod";
import { assignSkillToProject, getProject, listProjectSkillAssignmentsForOrganization } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  projectId: string;
}

const assignSkillSchema = z.object({
  skillId: z.string().min(1),
  requirement: z.enum(["required", "optional"]),
});

/**
 * `assignSkillToProject` throws the registered `ProjectNotFoundError`/
 * `SourceSkillNotFoundError`/`PersonalSkillNotAssignableError`/
 * `SkillNotEligibleForProjectError`/`DuplicateProjectSkillAssignmentError`/
 * authorization errors — all flow through `mapError` normally.
 */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = assignSkillSchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    assignSkillToProject(
      tx,
      caller.actingUser,
      params.projectId,
      body.skillId,
      { requirement: body.requirement },
      caller.auditContext,
    ),
  );
  return Response.json(result, { status: 201 });
}

/**
 * `listProjectSkillAssignmentsForOrganization` is organization-wide (no
 * `projectId` parameter at all) — filtered to this route's `projectId` here.
 * It performs no project-existence check on its own, so an explicit
 * `getProject` lookup is added for the same 404 `PROJECT_NOT_FOUND`
 * consistency as every sibling `/api/projects/{id}/*` route.
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
    const all = await listProjectSkillAssignmentsForOrganization(tx, caller.organizationId);
    return all.filter((assignment) => assignment.projectId === params.projectId);
  });

  if (result === null) {
    const mapped = notFoundResponse("PROJECT_NOT_FOUND", "Project not found");
    return Response.json(mapped.body, { status: mapped.status });
  }
  return Response.json(result);
}

export const POST = withApiRoute<Params>(handlePost);
export const GET = withApiRoute<Params>(handleGet);
