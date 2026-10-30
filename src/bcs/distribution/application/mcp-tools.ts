import { randomUUID } from "node:crypto";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import { record, type AuditContext } from "@/bcs/audit-compliance";
import {
  ExpansionSourceNotFoundError,
  expand,
  fetchExpandableVersion,
  listPrompts,
  listVersions,
  ChainStepResolutionFailedError,
  ReportOutputTooLargeError,
  RunAlreadyFinishedError,
  RunNotFoundError,
  RunStepConflictError,
  abandonSkillChainRun,
  advanceSkillChainRun,
  getSkillChainRun,
  startSkillChainRun,
  type ChainStepResolution,
  type PromptActor,
  type PromptSummary,
  type PromptVersionSummary,
} from "@/bcs/prompt-registry";
import { resolveEffectiveObjectives, resolveEffectivePolicies } from "@/bcs/governance";
import { withAudit, withTenantContext } from "@/shared/db";
import { assertCoreFeaturesEnabled } from "@/bcs/identity-access";
import { FEEDBACK_RATINGS, InvalidFeedbackError, ServeNotFoundError } from "../domain/feedback";
import { computeContentDigest } from "../domain/prompt-usage";
import { fileFeedback } from "./file-feedback";
import { recordPromptUsage } from "./record-prompt-usage";
import { type McpCaller, type McpSessionManager, mcpSessionManager } from "./mcp-session";

export type Db = PostgresJsDatabase<Record<string, never>>;

export const MCP_TOOL_NAMES = [
  "sh-list",
  "sh-search",
  "sh-context",
  "sh-run",
  "sh-chain-list",
  "sh-chain-run",
  "sh-chain-advance",
  "sh-chain-abandon",
  "sh-feedback",
  // Legacy names, kept as aliases of sh-chain-list / sh-chain-run for one release.
  "sh-workflow-list",
  "sh-workflow-run",
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export const toolInputSchemas = {
  "sh-list": {},
  "sh-search": { query: z.string().describe("Search term to match against skill names, descriptions, and tags.") },
  "sh-context": { project_id: z.string().optional().describe("Optional UUID of the project to layer on top.") },
  "sh-run": {
    name: z.string().describe("The skill name to run."),
    project: z.string().optional().describe("Optional project UUID to scope objective resolution."),
  },
  "sh-chain-list": {},
  "sh-chain-run": { name: z.string().describe("The chain name.") },
  "sh-chain-advance": {
    run_id: z.string().describe("The run id returned by sh-chain-run."),
    step_index: z.number().int().min(0).describe("The zero-based index of the step you are reporting on."),
    status: z.enum(["success", "error"]).describe("Whether you completed the step."),
    output: z.string().optional().describe("Your result for the step."),
    error: z.string().optional().describe("What went wrong, when status is error."),
  },
  "sh-chain-abandon": { run_id: z.string().describe("The run id to abandon.") },
  "sh-feedback": {
    serve_id: z.string().describe("The serve id printed by sh-run ([Serve <id> · ...])."),
    rating: z.enum(FEEDBACK_RATINGS).optional().describe("up if the skill worked, down if it did not."),
    text: z.string().optional().describe("A note for the skill's owner: what failed or what to change."),
    kind: z.enum(["signal", "note"]).optional().describe("Defaults to note when text is given, otherwise signal."),
  },
  "sh-workflow-list": {},
  "sh-workflow-run": {
    name: z.string().describe("The workflow name."),
    input: z.string().describe("The input text or JSON object string to pass to the first step."),
  },
} as const;

export const toolDescriptions: Record<McpToolName, string> = {
  "sh-list": "List all available skills (including chains) in the SkillCanon registry.",
  "sh-search": "Search skills by name or tag. Returned names can be passed to sh-run.",
  "sh-context": "Show effective policies and objectives for the authenticated user.",
  "sh-run": "Run a skill by name. Use sh-list or sh-search to discover available skills.",
  "sh-chain-list": "List all chains (multi-step skills) accessible to the authenticated user.",
  "sh-chain-run":
    "Start a chain run and get step 1. Do the step, then call sh-chain-advance with the run_id and your result to get the next step.",
  "sh-chain-advance": "Report the result of the current chain step and get the next step (or the end of the run).",
  "sh-chain-abandon": "Abandon an in-progress chain run.",
  "sh-feedback":
    "Tell the skill's owner how a run went, against the serve id from sh-run: a rating (up/down) and/or a note.",
  "sh-workflow-list": "Deprecated alias of sh-chain-list.",
  "sh-workflow-run": "Deprecated alias of sh-chain-run; input is ignored.",
};

export interface McpToolContext {
  db: Db;
  caller: McpCaller;
  sessionId: string;
  auditContext: AuditContext;
  sessionManager?: McpSessionManager;
}

function actorFromCaller(caller: McpCaller): PromptActor {
  return { organizationId: caller.user.orgId, userId: caller.user.id };
}

/** A tool-level failure the caller can act on; surfaced as `isError: true`, not a transport error. */
export class McpToolError extends Error {}

export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

export function parseLegacyInput(input: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(input);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Legacy accepts plain strings and wraps them as input.
  }
  return { input };
}

function parseUuidOrNull(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function formatWithSessionContext(contextBlock: string | null, result: string): string {
  return contextBlock ? `${contextBlock}\n\n${result}` : result;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

async function activeVersionForPrompt(
  db: Db,
  actor: PromptActor,
  prompt: PromptSummary,
): Promise<PromptVersionSummary | null> {
  const versions = await listVersions(db, actor, prompt.name);
  if (versions.length === 0) {
    return null;
  }
  if (prompt.activeVersionId) {
    const active = versions.find((version) => version.id === prompt.activeVersionId);
    if (active) {
      return active;
    }
  }
  return versions[versions.length - 1] ?? null;
}

// Tags live on versions, not skills: a skill's tags are the union across its versions.
function tagsFor(versions: PromptVersionSummary[]): string[] {
  const tags = versions.flatMap((version) =>
    Array.isArray(version.tags) ? version.tags.filter((tag): tag is string => typeof tag === "string") : [],
  );
  return [...new Set(tags)];
}

// sh-search used to print `sh-<name>`; keep accepting that form so copied names still run.
function bareName(name: string): string {
  return name.startsWith("sh-") ? name.slice(3) : name;
}

export async function maybeInjectSessionContext(ctx: McpToolContext): Promise<string | null> {
  const manager = ctx.sessionManager ?? mcpSessionManager;
  const state = manager.getOrCreate(ctx.sessionId);
  if (state.contextDelivered) {
    return null;
  }

  const actor = actorFromCaller(ctx.caller);
  const block = await withTenantContext(ctx.db, ctx.caller.user.orgId, async (tx) => {
    const [policies, objectives] = await Promise.all([
      resolveEffectivePolicies(tx, actor, ctx.caller.user.id),
      resolveEffectiveObjectives(tx, actor, ctx.caller.user.id),
    ]);

    const lines = ["═══ SESSION CONTEXT (auto-injected) ═══", "", "Policies:"];
    const allPolicies = [...policies.inherited, ...policies.local];
    if (allPolicies.length === 0) {
      lines.push("  (none configured)");
    } else {
      for (const policy of allPolicies) {
        const scope = policy.isInherited ? "inherited" : "local";
        lines.push(`  - [${policy.enforcementType}] ${policy.name}: ${truncate(policy.content, 120)} (${scope})`);
      }
    }

    lines.push("", "Objectives:");
    const allObjectives = [...objectives.inherited, ...objectives.local];
    if (allObjectives.length === 0) {
      lines.push("  (none configured)");
    } else {
      for (const objective of allObjectives) {
        const description = objective.description ? ` — ${truncate(objective.description, 80)}` : "";
        lines.push(`  - ${objective.title}${description}`);
      }
    }

    lines.push("", "═══════════════════════════════════════");
    return lines.join("\n");
  });

  manager.markContextDelivered(ctx.sessionId);
  return block;
}

export async function shList(ctx: McpToolContext): Promise<string> {
  assertCoreFeaturesEnabled();
  const contextBlock = await maybeInjectSessionContext(ctx);
  const actor = actorFromCaller(ctx.caller);
  const result = await withTenantContext(ctx.db, ctx.caller.user.orgId, async (tx) => {
    const prompts = await listPrompts(tx, actor);
    if (prompts.length === 0) {
      return "No prompts registered yet.";
    }
    return ["Available prompts:", ...prompts.map((prompt) => `  - ${prompt.name}`)].join("\n");
  });
  return formatWithSessionContext(contextBlock, result);
}

export async function shSearch(args: { query: string }, ctx: McpToolContext): Promise<string> {
  assertCoreFeaturesEnabled();
  const contextBlock = await maybeInjectSessionContext(ctx);
  const actor = actorFromCaller(ctx.caller);
  const result = await withTenantContext(ctx.db, ctx.caller.user.orgId, async (tx) => {
    const prompts = await listPrompts(tx, actor);
    const query = args.query.toLowerCase();
    const matches: string[] = [];
    for (const prompt of prompts) {
      const tags = tagsFor(await listVersions(tx, actor, prompt.name));
      const nameMatch = prompt.name.toLowerCase().includes(query);
      const descMatch = Boolean(prompt.description?.toLowerCase().includes(query));
      const tagMatch = tags.some((tag) => tag.toLowerCase().includes(query));
      if (nameMatch || descMatch || tagMatch) {
        matches.push(`  - ${prompt.name}: ${prompt.description ?? "No description"} [tags: ${tags.length > 0 ? tags.join(", ") : "none"}]`);
      }
    }
    if (matches.length === 0) {
      return `No prompts matching '${args.query}'.`;
    }
    return `Prompts matching '${args.query}':\n${matches.join("\n")}`;
  });
  return formatWithSessionContext(contextBlock, result);
}

export async function shContext(args: { project_id?: string }, ctx: McpToolContext): Promise<string> {
  assertCoreFeaturesEnabled();
  const contextBlock = await maybeInjectSessionContext(ctx);
  const projectId = parseUuidOrNull(args.project_id);
  if (args.project_id && !projectId) {
    throw new McpToolError("invalid project_id UUID.");
  }

  const actor = actorFromCaller(ctx.caller);
  const result = await withTenantContext(ctx.db, ctx.caller.user.orgId, async (tx) => {
    const [policies, objectives] = await Promise.all([
      resolveEffectivePolicies(tx, actor, ctx.caller.user.id),
      resolveEffectiveObjectives(tx, actor, ctx.caller.user.id, projectId),
    ]);

    const lines = ["=== Effective Policies ==="];
    if (policies.inherited.length > 0) {
      lines.push("Inherited (immutable):");
      for (const policy of policies.inherited) {
        lines.push(`  - [${policy.enforcementType}] ${policy.name}: ${truncate(policy.content, 80)}`);
      }
    }
    if (policies.local.length > 0) {
      lines.push("Local (mutable):");
      for (const policy of policies.local) {
        lines.push(`  - [${policy.enforcementType}] ${policy.name}: ${truncate(policy.content, 80)}`);
      }
    }
    if (policies.inherited.length === 0 && policies.local.length === 0) {
      lines.push("  (none)");
    }

    lines.push("\n=== Effective Objectives ===");
    if (objectives.inherited.length > 0) {
      lines.push("Inherited (immutable):");
      for (const objective of objectives.inherited) {
        lines.push(`  - ${objective.title}`);
      }
    }
    if (objectives.local.length > 0) {
      lines.push("Local (mutable):");
      for (const objective of objectives.local) {
        lines.push(`  - ${objective.title}`);
      }
    }
    if (objectives.inherited.length === 0 && objectives.local.length === 0) {
      lines.push("  (none)");
    }
    return lines.join("\n");
  });

  return formatWithSessionContext(contextBlock, result);
}

export interface ShRunResult {
  text: string;
  files: { name: string; content: string }[];
}

export async function shRun(args: { name: string; project?: string }, ctx: McpToolContext): Promise<string> {
  return (await shRunWithFiles(args, ctx)).text;
}

/** Like `shRun`, but also returns the skill's supporting files so the MCP layer can send them as extra blocks. */
export async function shRunWithFiles(args: { name: string; project?: string }, ctx: McpToolContext): Promise<ShRunResult> {
  assertCoreFeaturesEnabled();
  const contextBlock = await maybeInjectSessionContext(ctx);
  const actor = actorFromCaller(ctx.caller);
  const projectId = parseUuidOrNull(args.project) ?? undefined;

  const result = await withTenantContext(ctx.db, ctx.caller.user.orgId, async (tx) => {
    const accessible = await listPrompts(tx, actor, projectId ? { projectId } : {});
    const exact = accessible.some((prompt) => prompt.name === args.name);
    if (!exact && accessible.some((prompt) => prompt.name === bareName(args.name))) {
      args = { ...args, name: bareName(args.name) };
    } else if (!exact) {
      throw new McpToolError(`skill '${args.name}' not found or not shared with you.`);
    }

    const version = await fetchExpandableVersion(tx, ctx.caller.user.orgId, args.name);
    if (!version) {
      throw new McpToolError(`skill '${args.name}' not found.`);
    }
    if (version.kind === "chain") {
      throw new McpToolError(`'${args.name}' is a chain; use sh-chain-run to start it.`);
    }

    try {
      const expansion = await withAudit(
        tx,
        async (auditTx) => {
          const expanded = await expand(auditTx, {
            organizationId: ctx.caller.user.orgId,
            promptName: args.name,
            userId: ctx.caller.user.id,
            projectId,
          });
          const contentDigest = computeContentDigest(expanded.content);
          const serveId = await recordPromptUsage(auditTx, {
            organizationId: ctx.caller.user.orgId,
            promptId: version.promptId,
            promptVersionId: version.id,
            promptVersion: version.version,
            projectId: projectId ?? null,
            userId: ctx.caller.user.id,
            contentDigest,
          });
          return { ...expanded, serveId, contentDigest };
        },
        (auditTx) =>
          record(auditTx, {
            organizationId: ctx.caller.user.orgId,
            actorUserId: ctx.caller.user.id,
            actorApiKeyId: null,
            action: "prompt.expanded",
            resourceType: "prompt",
            resourceId: version.promptId,
            before: null,
            after: { promptName: args.name, promptVersionId: version.id, projectId: projectId ?? null },
            transport: ctx.auditContext.transport,
            sourceIp: ctx.auditContext.sourceIp ?? null,
          }),
      );

      const parts: string[] = [expansion.content];
      if (expansion.appliedPolicies.length > 0) {
        parts.push(`[Policies Applied]\n${expansion.appliedPolicies.join(", ")}`);
      }
      parts.push(`[Serve ${expansion.serveId} · version ${version.version} · digest ${expansion.contentDigest}]`);
      return { text: parts.join("\n\n"), files: expansion.files };
    } catch (err) {
      if (err instanceof ExpansionSourceNotFoundError) {
        throw new McpToolError(`skill '${args.name}' not found.`);
      }
      throw err;
    }
  });

  return { text: formatWithSessionContext(contextBlock, result.text), files: result.files };
}

export async function shChainList(ctx: McpToolContext): Promise<string> {
  assertCoreFeaturesEnabled();
  const contextBlock = await maybeInjectSessionContext(ctx);
  const actor = actorFromCaller(ctx.caller);
  const result = await withTenantContext(ctx.db, ctx.caller.user.orgId, async (tx) => {
    const prompts = await listPrompts(tx, actor);
    const lines = ["Available chains:"];
    for (const prompt of prompts) {
      const version = await activeVersionForPrompt(tx, actor, prompt);
      if (version?.kind !== "chain") {
        continue;
      }
      const stepCount = version.steps?.length ?? 0;
      const desc = prompt.description ? ` — ${prompt.description}` : "";
      lines.push(`  - ${prompt.name} (${stepCount} step${stepCount === 1 ? "" : "s"})${desc}`);
    }
    return lines.length === 1 ? "No chains found." : lines.join("\n");
  });
  return formatWithSessionContext(contextBlock, result);
}

function formatChainStep(runId: string, step: ChainStepResolution): string {
  return [
    `--- Step ${step.stepIndex + 1}: ${step.stepId} (${step.promptName} v${step.promptVersion}) ---`,
    step.content,
    "",
    `When done, call sh-chain-advance with run_id "${runId}", step_index ${step.stepIndex}, status and output.`,
  ].join("\n");
}

/** Legacy alias of `shChainList`. */
export const shWorkflowList = shChainList;

export async function shChainRun(args: { name: string }, ctx: McpToolContext): Promise<string> {
  assertCoreFeaturesEnabled();
  const contextBlock = await maybeInjectSessionContext(ctx);
  const actor = actorFromCaller(ctx.caller);
  const result = await withTenantContext(ctx.db, ctx.caller.user.orgId, async (tx) => {
    const prompts = await listPrompts(tx, actor);
    const match = prompts.find((prompt) => prompt.name.toLowerCase() === args.name.toLowerCase());
    const version = match ? await activeVersionForPrompt(tx, actor, match) : null;
    if (!match || version?.kind !== "chain") {
      throw new McpToolError(`chain '${args.name}' not found.`);
    }

    const run = await startSkillChainRun(tx, actor, match.name, undefined, ctx.auditContext).catch(() => null);
    if (!run) {
      throw new McpToolError(`failed to run chain '${args.name}'.`);
    }
    if ("done" in run) {
      return `Chain: ${match.name} has no steps to run.`;
    }
    const total = version.steps?.length ?? 0;
    return [`Chain: ${match.name} (${total} step${total === 1 ? "" : "s"})`, `runId: ${run.runId}`, "", formatChainStep(run.runId, run.step)].join("\n");
  });
  return formatWithSessionContext(contextBlock, result);
}

/** Legacy alias: `input` was never used by the run itself. */
export async function shWorkflowRun(args: { name: string; input: string }, ctx: McpToolContext): Promise<string> {
  return shChainRun({ name: args.name }, ctx);
}

export async function shChainAdvance(
  args: { run_id: string; step_index: number; status: "success" | "error"; output?: string; error?: string },
  ctx: McpToolContext,
): Promise<string> {
  assertCoreFeaturesEnabled();
  const actor = actorFromCaller(ctx.caller);
  const startedAt = Date.now();
  const orgId = ctx.caller.user.orgId;
  return withTenantContext(ctx.db, orgId, async (tx) => {
    // Same telemetry as REST advance: the step being reported on, if it is a template skill.
    const pendingStep = (await getSkillChainRun(tx, orgId, args.run_id))?.steps.find(
      (step) => step.stepIndex === args.step_index && step.reportedStatus === null,
    );
    const stepVersion = pendingStep
      ? await fetchExpandableVersion(tx, orgId, pendingStep.promptName, pendingStep.promptVersion)
      : null;
    const result = await advanceSkillChainRun(
      tx,
      actor,
      args.run_id,
      { stepIndex: args.step_index, status: args.status, output: args.output, error: args.error },
      ctx.auditContext,
    );
    if (stepVersion?.kind === "template") {
      await recordPromptUsage(tx, {
        organizationId: orgId,
        promptId: stepVersion.promptId,
        promptVersionId: stepVersion.id,
        promptVersion: stepVersion.version,
        projectId: null,
        userId: ctx.caller.user.id,
        statusCode: args.status === "success" ? 200 : 500,
        latencyMs: Date.now() - startedAt,
      });
    }
    if ("done" in result) {
      return args.status === "success" ? "Chain run complete." : "Chain run finished.";
    }
    return formatChainStep(args.run_id, result.step);
  });
}

export async function shChainAbandon(args: { run_id: string }, ctx: McpToolContext): Promise<string> {
  assertCoreFeaturesEnabled();
  await withTenantContext(ctx.db, ctx.caller.user.orgId, (tx) =>
    abandonSkillChainRun(tx, actorFromCaller(ctx.caller), args.run_id, ctx.auditContext),
  );
  return "Chain run abandoned.";
}

export async function shFeedback(
  args: { serve_id: string; rating?: "up" | "down"; text?: string; kind?: "signal" | "note" },
  ctx: McpToolContext,
): Promise<string> {
  assertCoreFeaturesEnabled();
  const kind = args.kind ?? (args.text?.trim() ? "note" : "signal");
  await withTenantContext(ctx.db, ctx.caller.user.orgId, (tx) =>
    fileFeedback(
      tx,
      { organizationId: ctx.caller.user.orgId, userId: ctx.caller.user.id },
      { serveId: args.serve_id, kind, rating: args.rating, text: args.text },
      ctx.auditContext,
    ),
  );
  return "Feedback recorded. Thank you.";
}

export async function invokeMcpTool(name: McpToolName, args: unknown, ctx: McpToolContext): Promise<CallToolResult> {
  try {
    return await dispatchMcpTool(name, args, ctx);
  } catch (err) {
    if (
      err instanceof McpToolError ||
      err instanceof ServeNotFoundError ||
      err instanceof InvalidFeedbackError ||
      err instanceof RunNotFoundError ||
      err instanceof RunAlreadyFinishedError ||
      err instanceof RunStepConflictError ||
      err instanceof ReportOutputTooLargeError ||
      err instanceof ChainStepResolutionFailedError
    ) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
    if (err instanceof z.ZodError) {
      return { content: [{ type: "text", text: `Error: invalid arguments: ${err.message}` }], isError: true };
    }
    throw err;
  }
}

async function dispatchMcpTool(name: McpToolName, args: unknown, ctx: McpToolContext): Promise<CallToolResult> {
  switch (name) {
    case "sh-list":
      return textResult(await shList(ctx));
    case "sh-search":
      return textResult(await shSearch(toolInputSchemas["sh-search"].query ? z.object(toolInputSchemas["sh-search"]).parse(args) : { query: "" }, ctx));
    case "sh-context":
      return textResult(await shContext(z.object(toolInputSchemas["sh-context"]).parse(args ?? {}), ctx));
    case "sh-run": {
      const { text, files } = await shRunWithFiles(z.object(toolInputSchemas["sh-run"]).parse(args), ctx);
      return {
        content: [
          { type: "text", text },
          ...files.map((file) => ({ type: "text" as const, text: `[Supporting file: ${file.name}]\n${file.content}` })),
        ],
      };
    }
    case "sh-chain-list":
    case "sh-workflow-list":
      return textResult(await shChainList(ctx));
    case "sh-chain-run":
      return textResult(await shChainRun(z.object(toolInputSchemas["sh-chain-run"]).parse(args), ctx));
    case "sh-chain-advance":
      return textResult(await shChainAdvance(z.object(toolInputSchemas["sh-chain-advance"]).parse(args), ctx));
    case "sh-chain-abandon":
      return textResult(await shChainAbandon(z.object(toolInputSchemas["sh-chain-abandon"]).parse(args), ctx));
    case "sh-feedback":
      return textResult(await shFeedback(z.object(toolInputSchemas["sh-feedback"]).parse(args), ctx));
    case "sh-workflow-run":
      return textResult(await shWorkflowRun(z.object(toolInputSchemas["sh-workflow-run"]).parse(args), ctx));
    default:
      return textResult(`Error: unknown tool '${name satisfies never}'.`);
  }
}

export function createSyntheticSessionId(): string {
  return `mcp-${randomUUID()}`;
}
