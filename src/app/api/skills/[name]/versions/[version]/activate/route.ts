import { z } from "zod";
import { activateCandidateVersion } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

type Ctx = { caller: ResolvedCaller; params: { name: string; version: string }; db: Db };

const bodySchema = z.object({ reason: z.string() });

/** Admin or skill owner activates a candidate despite the eval gate; the reason is audited. */
export async function handlePost(request: Request, { caller, params, db }: Ctx) {
  const { reason } = bodySchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    activateCandidateVersion(tx, caller.actingUser, params.name, params.version, reason, caller.auditContext),
  );
  return Response.json(result);
}

export const POST = withApiRoute(handlePost);
