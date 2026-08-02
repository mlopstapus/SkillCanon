import { z } from "zod";
import { getPrompt, listSubscriptionsForSkill, subscribeSkill } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  name: string;
}

const subscribeSchema = z.object({
  subscriberType: z.enum(["user", "team", "project"]),
  subscriberId: z.string().min(1),
});

/**
 * `subscribeSkill`/`listSubscriptionsForSkill` key off `sourceSkillId`, not
 * `name` — the route resolves the prompt via `getPrompt` first, mapping a
 * `null` result to `SKILL_NOT_FOUND` before calling either BC function.
 * `subscribeSkill` also throws registered `CannotSubscribeToOwnSkillError`/
 * `SubscriberNotAuthorizedError`/`DuplicateSubscriptionError`/
 * `CrossOrgSubscriberError`, all of which flow through the shared mapper
 * untouched.
 */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = subscribeSchema.parse(await request.json());
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
    const result = await subscribeSkill(tx, caller.actingUser, prompt.id, body, caller.auditContext);
    return Response.json(result, { status: 201 });
  });
}

export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
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
    const subscriptions = await listSubscriptionsForSkill(tx, caller.organizationId, prompt.id);
    return Response.json(subscriptions);
  });
}

export const POST = withApiRoute<Params>(handlePost);
export const GET = withApiRoute<Params>(handleGet);
