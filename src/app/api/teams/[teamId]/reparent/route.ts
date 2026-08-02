import { z } from "zod";
import { getTeam, reparentTeam } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  teamId: string;
}

const reparentSchema = z.object({
  newParentTeamId: z.string().min(1),
});

/**
 * `updateTeam` explicitly excludes hierarchy changes (its own doc
 * comment) — this is the dedicated route for moving a team to a new
 * parent (research.md). `reparentTeam` throws the same bare untyped
 * `Error` as `getTeam`/`updateTeam` for either a nonexistent `teamId` or
 * `newParentTeamId` — no registered domain class exists for that case;
 * `CrossOrgReparentError`/`CycleError`/`NotAuthorizedError` are real
 * registered classes and propagate to the shared mapper untouched.
 */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = reparentSchema.parse(await request.json());
  try {
    await withTenantContext(db, caller.organizationId, (tx) =>
      reparentTeam(tx, params.teamId, body.newParentTeamId, caller.actingUser, {
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

export const POST = withApiRoute<Params>(handlePost);
