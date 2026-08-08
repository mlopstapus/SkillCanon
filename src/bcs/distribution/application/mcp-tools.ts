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
  startSkillChainRun,
  type PromptActor,
  type PromptSummary,
  type PromptVersionSummary,
} from "@/bcs/prompt-registry";
import { resolveEffectiveObjectives, resolveEffectivePolicies } from "@/bcs/governance";
import { withAudit, withTenantContext } from "@/shared/db";
import { assertCoreFeaturesEnabled } from "@/bcs/identity-access";
import { recordPromptUsage } from "./record-prompt-usage";
import { type McpCaller, type McpSessionManager, mcpSessionManager } from "./mcp-session";

export type Db = PostgresJsDatabase<Record<string, never>>;

export const MCP_TOOL_NAMES = [
  "sh-list",
  "sh-search",
  "sh-context",
  "sh-run",
  "sh-workflow-list",
  "sh-workflow-run",
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export const toolInputSchemas = {
  "sh-list": {},
  "sh-search": { query: z.string().describe("Search term to match against prompt names, descriptions, and tags.") },
  "sh-context": { project_id: z.string().optional().describe("Optional UUID of the project to layer on top.") },
  "sh-run": {
    name: z.string().describe("The prompt name to run."),
    project: z.string().optional().describe("Optional project UUID to scope objective resolution."),
  },
  "sh-workflow-list": {},
  "sh-workflow-run": {
    name: z.string().describe("The workflow name."),
    input: z.string().describe("The input text or JSON object string to pass to the first step."),
  },
} as const;

export const toolDescriptions: Record<McpToolName, string> = {
  "sh-list": "List all available prompts in the SkillCanon registry.",
  "sh-search": "Search prompts by name or tag.",
  "sh-context": "Show effective policies and objectives for the authenticated user.",
  "sh-run": "Run a prompt by name. Use sh-list or sh-search to discover available prompts.",
  "sh-workflow-list": "List all workflows accessible to the authenticated user.",
  "sh-workflow-run": "Run a workflow by name. Each step's output is automatically passed to the next step.",
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

function tagsFor(version: PromptVersionSummary | null): string[] {
  return Array.isArray(version?.tags) ? version.tags.filter((tag): tag is string => typeof tag === "string") : [];
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
      const version = await activeVersionForPrompt(tx, actor, prompt);
      const tags = tagsFor(version);
      const nameMatch = prompt.name.toLowerCase().includes(query);
      const descMatch = Boolean(prompt.description?.toLowerCase().includes(query));
      const tagMatch = tags.some((tag) => tag.toLowerCase().includes(query));
      if (nameMatch || descMatch || tagMatch) {
        matches.push(`  - sh-${prompt.name}: ${prompt.description ?? "No description"} [tags: ${tags.length > 0 ? tags.join(", ") : "none"}]`);
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
    return formatWithSessionContext(contextBlock, "Error: invalid project_id UUID.");
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

export async function shRun(args: { name: string; project?: string }, ctx: McpToolContext): Promise<string> {
  assertCoreFeaturesEnabled();
  const contextBlock = await maybeInjectSessionContext(ctx);
  const actor = actorFromCaller(ctx.caller);
  const projectId = parseUuidOrNull(args.project) ?? undefined;

  const result = await withTenantContext(ctx.db, ctx.caller.user.orgId, async (tx) => {
    const accessible = await listPrompts(tx, actor, projectId ? { projectId } : {});
    if (!accessible.some((prompt) => prompt.name === args.name)) {
      return `Error: prompt '${args.name}' not found or not shared with you.`;
    }

    const version = await fetchExpandableVersion(tx, ctx.caller.user.orgId, args.name);
    if (!version || version.kind === "chain") {
      return `Error: prompt '${args.name}' not found.`;
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
          await recordPromptUsage(auditTx, {
            organizationId: ctx.caller.user.orgId,
            promptId: version.promptId,
            promptVersionId: version.id,
            projectId: projectId ?? null,
            userId: ctx.caller.user.id,
          });
          return expanded;
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
      return parts.join("\n\n");
    } catch (err) {
      if (err instanceof ExpansionSourceNotFoundError) {
        return `Error: prompt '${args.name}' not found.`;
      }
      throw err;
    }
  });

  return formatWithSessionContext(contextBlock, result);
}

export async function shWorkflowList(ctx: McpToolContext): Promise<string> {
  assertCoreFeaturesEnabled();
  const contextBlock = await maybeInjectSessionContext(ctx);
  const actor = actorFromCaller(ctx.caller);
  const result = await withTenantContext(ctx.db, ctx.caller.user.orgId, async (tx) => {
    const prompts = await listPrompts(tx, actor);
    const lines = ["Available workflows:"];
    for (const prompt of prompts) {
      const version = await activeVersionForPrompt(tx, actor, prompt);
      if (version?.kind !== "chain") {
        continue;
      }
      const stepCount = version.steps?.length ?? 0;
      const desc = prompt.description ? ` — ${prompt.description}` : "";
      lines.push(`  - ${prompt.name} (${stepCount} step${stepCount === 1 ? "" : "s"})${desc}`);
    }
    return lines.length === 1 ? "No workflows found." : lines.join("\n");
  });
  return formatWithSessionContext(contextBlock, result);
}

export async function shWorkflowRun(args: { name: string; input: string }, ctx: McpToolContext): Promise<string> {
  assertCoreFeaturesEnabled();
  const contextBlock = await maybeInjectSessionContext(ctx);
  const actor = actorFromCaller(ctx.caller);
  const result = await withTenantContext(ctx.db, ctx.caller.user.orgId, async (tx) => {
    const prompts = await listPrompts(tx, actor);
    const match = prompts.find((prompt) => prompt.name.toLowerCase() === args.name.toLowerCase());
    if (!match) {
      return `Error: workflow '${args.name}' not found.`;
    }
    const version = await activeVersionForPrompt(tx, actor, match);
    if (version?.kind !== "chain") {
      return `Error: workflow '${args.name}' not found.`;
    }

    const run = await startSkillChainRun(tx, actor, match.name, undefined, ctx.auditContext).catch(() => null);
    if (!run) {
      return `Error: failed to run workflow '${args.name}'.`;
    }

    const steps = version.steps ?? [];
    if ("done" in run) {
      return [`Workflow: ${match.name} (${steps.length} steps)`, "", "--- Final Outputs ---", JSON.stringify({}, null, 2)].join("\n");
    }

    const parts = [`Workflow: ${match.name} (${steps.length} steps)`];
    parts.push(`\n--- ✓ ${run.step.stepId} (${run.step.promptName} v${run.step.promptVersion}) ---`);
    parts.push(run.step.content);
    parts.push("\n--- Final Outputs ---");
    parts.push(JSON.stringify({ runId: run.runId, pendingStep: run.step.stepId, input: parseLegacyInput(args.input) }, null, 2));
    return parts.join("\n");
  });
  return formatWithSessionContext(contextBlock, result);
}

export async function invokeMcpTool(name: McpToolName, args: unknown, ctx: McpToolContext): Promise<CallToolResult> {
  switch (name) {
    case "sh-list":
      return textResult(await shList(ctx));
    case "sh-search":
      return textResult(await shSearch(toolInputSchemas["sh-search"].query ? z.object(toolInputSchemas["sh-search"]).parse(args) : { query: "" }, ctx));
    case "sh-context":
      return textResult(await shContext(z.object(toolInputSchemas["sh-context"]).parse(args ?? {}), ctx));
    case "sh-run":
      return textResult(await shRun(z.object(toolInputSchemas["sh-run"]).parse(args), ctx));
    case "sh-workflow-list":
      return textResult(await shWorkflowList(ctx));
    case "sh-workflow-run":
      return textResult(await shWorkflowRun(z.object(toolInputSchemas["sh-workflow-run"]).parse(args), ctx));
    default:
      return textResult(`Error: unknown tool '${name satisfies never}'.`);
  }
}

export function createSyntheticSessionId(): string {
  return `mcp-${randomUUID()}`;
}
