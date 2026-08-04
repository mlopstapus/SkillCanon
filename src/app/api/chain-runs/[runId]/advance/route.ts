import { z } from "zod";
import { recordPromptUsage } from "@/bcs/distribution";
import { advanceSkillChainRun, fetchExpandableVersion, getSkillChainRun } from "@/bcs/prompt-registry";
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
  const startedAt = Date.now();
  const report = advanceSchema.parse(await request.json());
  const telemetryVersion = await withTenantContext(db, caller.organizationId, async (tx) => {
    const existingRun = await getSkillChainRun(tx, caller.organizationId, params.runId);
    const pendingStep = existingRun?.steps.find(
      (step) => step.stepIndex === report.stepIndex && step.reportedStatus === null,
    );
    if (!pendingStep) {
      return null;
    }
    const version = await fetchExpandableVersion(
      tx,
      caller.organizationId,
      pendingStep.promptName,
      pendingStep.promptVersion,
    );
    return version?.kind === "template" ? version : null;
  });

  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    advanceSkillChainRun(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      params.runId,
      report,
      caller.auditContext,
    ),
  );

  if (telemetryVersion) {
    await withTenantContext(db, caller.organizationId, (tx) =>
      recordPromptUsage(tx, {
        organizationId: caller.organizationId,
        promptId: telemetryVersion.promptId,
        promptVersionId: telemetryVersion.id,
        promptVersion: telemetryVersion.version,
        projectId: null,
        userId: caller.actingUser.id,
        statusCode: report.status === "success" ? 200 : 500,
        latencyMs: Date.now() - startedAt,
      }),
    );
  }

  return Response.json(result);
}

export const POST = withApiRoute<Params>(handlePost);
