import { z } from "zod";
import { getPrompt, listSkillChainRuns, startSkillChainRun } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  name: string;
}

const startRunSchema = z.object({
  version: z.string().optional(),
});

export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = startRunSchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    startSkillChainRun(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      params.name,
      body.version,
      caller.auditContext,
    ),
  );
  return Response.json(result, { status: 201 });
}

export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const result = await withTenantContext(db, caller.organizationId, async (tx) => {
    const prompt = await getPrompt(tx, { organizationId: caller.organizationId, userId: caller.actingUser.id }, params.name);
    if (!prompt) {
      return null;
    }
    return listSkillChainRuns(tx, caller.organizationId, prompt.id);
  });

  if (result === null) {
    const mapped = notFoundResponse("SKILL_NOT_FOUND", "Skill not found");
    return Response.json(mapped.body, { status: mapped.status });
  }
  return Response.json(result);
}

export const POST = withApiRoute<Params>(handlePost);
export const GET = withApiRoute<Params>(handleGet);
