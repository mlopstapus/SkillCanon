import { z } from "zod";
import { createPrompt, listPrompts } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { paginate, parsePageParams } from "@/shared/api/pagination";
import type { ResolvedCaller } from "@/shared/api/auth";

const createPromptSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

/**
 * `createPrompt` always owns the new skill by the creating user (PDR-016,
 * confirmed by reading `application/create-prompt.ts`) — it has no
 * `ownerType`/`ownerId` param at all, unlike what a generic contract read
 * might suggest. The route body only accepts `name`/`description`.
 */
export async function handlePost(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const body = createPromptSchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    createPrompt(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      { organizationId: caller.organizationId, ...body },
      caller.auditContext,
    ),
  );
  return Response.json(result, { status: 201 });
}

/**
 * `listPrompts` computes the CALLER's own accessible-skill set (skills they
 * own, their team owns, or they/their team/their projects subscribe to) —
 * it takes an `actor: { organizationId, userId }`, never a bare
 * organization-wide listing (per its own JSDoc).
 */
export async function handleGet(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const url = new URL(request.url);
  const pageParams = parsePageParams(url);
  const projectId = url.searchParams.get("projectId");

  const prompts = await withTenantContext(db, caller.organizationId, (tx) =>
    listPrompts(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      projectId ? { projectId } : {},
    ),
  );

  return Response.json(paginate(prompts, pageParams));
}

export const POST = withApiRoute(handlePost);
export const GET = withApiRoute(handleGet);
