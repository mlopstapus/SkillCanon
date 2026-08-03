import { z } from "zod";
import { insertTeamBetween } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  teamId: string;
}

const insertParentSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
});

/**
 * Inserts a new team between `params.teamId` and its current parent
 * (`insertTeamBetween`). Throws the same bare untyped `Error` as
 * `getTeam`/`updateTeam` for a nonexistent `childTeamId` — no registered
 * domain class exists (research.md's three-shapes decision).
 */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = insertParentSchema.parse(await request.json());
  try {
    const result = await withTenantContext(db, caller.organizationId, (tx) =>
      insertTeamBetween(
        tx,
        { organizationId: caller.organizationId, name: body.name, slug: body.slug },
        params.teamId,
        caller.actingUser,
        { auditContext: caller.auditContext },
      ),
    );
    return Response.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("No team found with id")) {
      const mapped = notFoundResponse("TEAM_NOT_FOUND", "Team not found");
      return Response.json(mapped.body, { status: mapped.status });
    }
    throw err;
  }
}

export const POST = withApiRoute<Params>(handlePost);
