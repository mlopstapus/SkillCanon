import { unassignSkillFromProject } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  projectId: string;
  skillId: string;
}

/** `unassignSkillFromProject` throws the registered `ProjectNotFoundError`/`ProjectSkillAssignmentNotFoundError`/authorization errors — flows through `mapError` normally. */
export async function handleDelete(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  await withTenantContext(db, caller.organizationId, (tx) =>
    unassignSkillFromProject(tx, caller.actingUser, params.projectId, params.skillId, caller.auditContext),
  );
  return new Response(null, { status: 204 });
}

export const DELETE = withApiRoute<Params>(handleDelete);
