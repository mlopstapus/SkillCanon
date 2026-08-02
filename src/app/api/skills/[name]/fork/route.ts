import { z } from "zod";
import { forkSkill, getPrompt } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  name: string;
}

const forkSchema = z.object({
  ownerType: z.enum(["user", "team"]),
  ownerId: z.string().min(1),
});

/**
 * `forkSkill` keys off `sourceSkillId`, not `name` — resolved via
 * `getPrompt` first, mapping `null` to `SKILL_NOT_FOUND`. Throws registered
 * `CannotForkOwnSkillError`/`SubscriberNotAuthorizedError` for its
 * business-rule rejections — both flow through the shared mapper untouched.
 */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = forkSchema.parse(await request.json());
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
    const result = await forkSkill(tx, caller.actingUser, prompt.id, body, caller.auditContext);
    return Response.json(result, { status: 201 });
  });
}

export const POST = withApiRoute<Params>(handlePost);
