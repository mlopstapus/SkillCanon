import { z } from "zod";
import { advanceSkillChainRun } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  runId: string;
}

const advanceSchema = z.object({
  stepIndex: z.number().int().min(0),
  status: z.enum(["success", "error"]),
  output: z.string().optional(),
  error: z.string().optional(),
});

export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const report = advanceSchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    advanceSkillChainRun(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      params.runId,
      report,
      caller.auditContext,
    ),
  );
  return Response.json(result);
}

export const POST = withApiRoute<Params>(handlePost);
