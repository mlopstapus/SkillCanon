import { removeProjectMember } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  projectId: string;
  userId: string;
}

/** `removeProjectMember` throws the registered `ProjectNotFoundError`/`ProjectMemberNotFoundError` — flows through `mapError` normally. */
export async function handleDelete(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const actor = { organizationId: caller.organizationId, userId: caller.actingUser.id };
  await withTenantContext(db, caller.organizationId, (tx) =>
    removeProjectMember(tx, actor, params.projectId, params.userId, caller.auditContext),
  );
  return new Response(null, { status: 204 });
}

export const DELETE = withApiRoute<Params>(handleDelete);
