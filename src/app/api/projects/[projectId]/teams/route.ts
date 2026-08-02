import { z } from "zod";
import { addCollaboratorTeam, listProjectTeams } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  projectId: string;
}

const addCollaboratorTeamSchema = z.object({
  teamId: z.string().min(1),
});

/**
 * `addCollaboratorTeam` throws the registered `ProjectNotFoundError`/
 * `OwnerTeamCannotBeCollaboratorError`/`ProjectTeamOrgMismatchError`/
 * `DuplicateCollaboratorTeamError`/`SubscriberNotAuthorizedError`/
 * `CrossOrgSubscriberError` (owner-team-admin authorization gate lives
 * inside the BC call itself, via `assertAuthorizedForOwner`) — all flow
 * through `mapError` normally.
 */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = addCollaboratorTeamSchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    addCollaboratorTeam(tx, caller.actingUser, params.projectId, body, caller.auditContext),
  );
  return Response.json(result, { status: 201 });
}

/** `listProjectTeams` throws the registered `ProjectNotFoundError` for a nonexistent/cross-org project. */
export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const teams = await withTenantContext(db, caller.organizationId, (tx) =>
    listProjectTeams(tx, caller.organizationId, params.projectId),
  );
  return Response.json(teams);
}

export const POST = withApiRoute<Params>(handlePost);
export const GET = withApiRoute<Params>(handleGet);
