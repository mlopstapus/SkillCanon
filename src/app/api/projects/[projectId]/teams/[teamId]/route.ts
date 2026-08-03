import { removeCollaboratorTeam } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  projectId: string;
  teamId: string;
}

/** `removeCollaboratorTeam` throws the registered `ProjectNotFoundError`/`CollaboratorTeamNotFoundError`/authorization errors — flows through `mapError` normally. */
export async function handleDelete(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  await withTenantContext(db, caller.organizationId, (tx) =>
    removeCollaboratorTeam(tx, caller.actingUser, params.projectId, { teamId: params.teamId }, caller.auditContext),
  );
  return new Response(null, { status: 204 });
}

export const DELETE = withApiRoute<Params>(handleDelete);
