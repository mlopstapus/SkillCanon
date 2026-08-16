import { z } from "zod";
import { CrossOrgTeamAccessError, getTeam, updateTeam } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  teamId: string;
}

const updateTeamSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().optional(),
  ownerId: z.string().optional(),
});

/**
 * `getTeam` throws `CrossOrgTeamAccessError` for a nonexistent or
 * cross-organization team. This route keeps the established external
 * `TEAM_NOT_FOUND` response while allowing operational errors to propagate.
 */
export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  try {
    const team = await withTenantContext(db, caller.organizationId, (tx) =>
      getTeam(tx, caller.organizationId, params.teamId),
    );
    return Response.json(team);
  } catch (err) {
    if (err instanceof CrossOrgTeamAccessError) {
      const mapped = notFoundResponse("TEAM_NOT_FOUND", "Team not found");
      return Response.json(mapped.body, { status: mapped.status });
    }
    throw err;
  }
}

/**
 * `updateTeam` throws the same bare `Error` for "not found," but a real
 * `NotAuthorizedError`/`DuplicateTeamSlugError` for its other failure
 * modes — those must propagate to the shared mapper untouched, only the
 * bare not-found `Error` is special-cased here.
 */
export async function handlePut(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = updateTeamSchema.parse(await request.json());
  try {
    await withTenantContext(db, caller.organizationId, (tx) =>
      updateTeam(tx, caller.organizationId, params.teamId, body, caller.actingUser, {
        auditContext: caller.auditContext,
      }),
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("No team found with id")) {
      const mapped = notFoundResponse("TEAM_NOT_FOUND", "Team not found");
      return Response.json(mapped.body, { status: mapped.status });
    }
    throw err;
  }
  const team = await withTenantContext(db, caller.organizationId, (tx) =>
    getTeam(tx, caller.organizationId, params.teamId),
  );
  return Response.json(team);
}

export const GET = withApiRoute<Params>(handleGet);
export const PUT = withApiRoute<Params>(handlePut);
