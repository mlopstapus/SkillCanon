import { z } from "zod";
import { FEEDBACK_KINDS, FEEDBACK_RATINGS, fileFeedback } from "@/bcs/distribution";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

const feedbackSchema = z.object({
  serveId: z.string().min(1),
  kind: z.enum(FEEDBACK_KINDS),
  rating: z.enum(FEEDBACK_RATINGS).nullable().optional(),
  text: z.string().nullable().optional(),
});

/** Files feedback against a serve the caller's organization produced (016/002). */
export async function handlePost(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const body = feedbackSchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    fileFeedback(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      body,
      caller.auditContext,
    ),
  );
  return Response.json(result, { status: 201 });
}

export const POST = withApiRoute(handlePost);
