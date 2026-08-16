import { z } from "zod";
import { getPrompt, transferSkillOwnership } from "@/bcs/prompt-registry";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";
import { notFoundResponse } from "@/shared/api/errors";
import { withTenantContext } from "@/shared/db";

interface Params {
  name: string;
}

const transferSchema = z.object({
  newOwnerType: z.enum(["user", "team"]),
  newOwnerId: z.string().min(1),
});

export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = transferSchema.parse(await request.json());
  return withTenantContext(db, caller.organizationId, async (tx) => {
    const prompt = await getPrompt(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      params.name,
    );
    if (!prompt) {
      const mapped = notFoundResponse("SKILL_NOT_FOUND", "Skill not found");
      return Response.json(mapped.body, { status: mapped.status });
    }
    const result = await transferSkillOwnership(tx, caller.actingUser, prompt.id, body, caller.auditContext);
    return Response.json(result);
  });
}

export const POST = withApiRoute<Params>(handlePost);
