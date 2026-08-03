import { z } from "zod";
import { getTeam, updateTeam } from "@/bcs/identity-access";
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
 * `getTeam` throws a bare, untyped `Error` for "not found" — no
 * `TeamNotFoundError` class exists in identity-access (research.md's
 * three-shapes decision). Any error from this specific call is treated as
 * TEAM_NOT_FOUND; `getTeam` has exactly one throw path.
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
    if (err instanceof Error && err.message.startsWith("No team found with id")) {
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
