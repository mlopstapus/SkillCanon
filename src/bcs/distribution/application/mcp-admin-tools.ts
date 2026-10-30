import { z } from "zod";
import {
  InvalidObjectiveInputError,
  InvalidPolicyScopeError,
  ObjectiveNotAuthorizedError,
  ObjectiveNotFoundError,
  ObjectiveParentNotFoundError,
  ObjectiveScopeNotFoundError,
  PolicyNotAuthorizedError,
  PolicyNotFoundError,
  PolicyScopeNotFoundError,
  createObjective,
  createPolicy,
  deleteObjective,
  deletePolicy,
  listTeamObjectives,
  listTeamPolicies,
  updateObjective,
  updatePolicy,
  type ObjectiveScopeVerifier,
  type PolicyEnforcementType,
  type PolicyScopeVerifier,
} from "@/bcs/governance";
import { CrossOrgUserAccessError, NotAuthorizedError, assertCoreFeaturesEnabled, getTeam } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { getPromptUsageSummaryForOrganization } from "./get-prompt-usage-summary-for-organization";
import { AiNotEnabledError } from "./governance-interview";
import { McpToolError } from "./mcp-errors";
import { OrgSummaryNotAllowedError, summarizeObjectives } from "./summarize-objectives";
import type { McpToolContext } from "./mcp-tools";

export const ADMIN_TOOL_NAMES = [
  "sh-admin-policy-list",
  "sh-admin-policy-create",
  "sh-admin-policy-update",
  "sh-admin-policy-delete",
  "sh-admin-objective-list",
  "sh-admin-objective-create",
  "sh-admin-objective-update",
  "sh-admin-objective-delete",
  "sh-admin-objective-summary",
  "sh-metrics-summary",
] as const;

export type AdminToolName = (typeof ADMIN_TOOL_NAMES)[number];

// Mirrors the governance constant; a value import from the barrel is undefined mid-cycle at module load.
const ENFORCEMENT_TYPES = ["prepend", "append", "inject", "validate"] as const satisfies readonly PolicyEnforcementType[];

const teamId = z.string().min(1).describe("The team id.");
const policyFields = {
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  enforcementType: z.enum(ENFORCEMENT_TYPES),
  content: z.string().min(1),
  priority: z.number().int().optional(),
};
const objectiveFields = {
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  parentObjectiveId: z.string().nullable().optional(),
  status: z.string().optional(),
};

export const adminToolInputSchemas = {
  "sh-admin-policy-list": { team_id: teamId },
  "sh-admin-policy-create": { team_id: teamId, ...policyFields },
  "sh-admin-policy-update": {
    policy_id: z.string().min(1),
    name: policyFields.name.optional(),
    description: policyFields.description,
    enforcementType: policyFields.enforcementType.optional(),
    content: policyFields.content.optional(),
    priority: policyFields.priority,
  },
  "sh-admin-policy-delete": { policy_id: z.string().min(1) },
  "sh-admin-objective-list": { team_id: teamId },
  "sh-admin-objective-create": { team_id: teamId, ...objectiveFields },
  "sh-admin-objective-update": {
    objective_id: z.string().min(1),
    title: objectiveFields.title.optional(),
    description: objectiveFields.description,
    parentObjectiveId: objectiveFields.parentObjectiveId,
    status: objectiveFields.status,
  },
  "sh-admin-objective-delete": { objective_id: z.string().min(1) },
  "sh-admin-objective-summary": {
    team_id: z.string().min(1).optional().describe("Summarize this team. Omit for the whole organization (admin only)."),
  },
  "sh-metrics-summary": {
    from: z.string().date().optional().describe("Start date (YYYY-MM-DD). Default: 30 days before `to`."),
    to: z.string().date().optional().describe("End date (YYYY-MM-DD). Default: now."),
  },
} as const;

export const adminToolDescriptions: Record<AdminToolName, string> = {
  "sh-admin-policy-list": "List a team's policies. Needs the governance:read scope.",
  "sh-admin-policy-create": "Create a team policy. Needs governance:write and an admin or team owner.",
  "sh-admin-policy-update": "Update a policy. Needs governance:write and an admin or team owner.",
  "sh-admin-policy-delete": "Delete (deactivate) a policy. Needs governance:write and an admin or team owner.",
  "sh-admin-objective-list": "List a team's objectives. Needs the governance:read scope.",
  "sh-admin-objective-create": "Create a team objective. Needs governance:write and an admin or team owner.",
  "sh-admin-objective-update": "Update an objective. Needs governance:write and an admin or team owner.",
  "sh-admin-objective-delete": "Delete an objective. Needs governance:write and an admin or team owner.",
  "sh-admin-objective-summary":
    "Read the cached AI summary of a team's (or the organization's) objectives. Needs governance:read; never calls a model.",
  "sh-metrics-summary": "Org-wide skill usage summary for a date window. Needs the metrics:read scope.",
};

const REQUIRED_SCOPE: Record<AdminToolName, string> = {
  "sh-admin-policy-list": "governance:read",
  "sh-admin-policy-create": "governance:write",
  "sh-admin-policy-update": "governance:write",
  "sh-admin-policy-delete": "governance:write",
  "sh-admin-objective-list": "governance:read",
  "sh-admin-objective-create": "governance:write",
  "sh-admin-objective-update": "governance:write",
  "sh-admin-objective-delete": "governance:write",
  "sh-admin-objective-summary": "governance:read",
  "sh-metrics-summary": "metrics:read",
};

/** Domain failures an admin tool turns into an `isError` result rather than a crash. Evaluated lazily: the barrel imports are still undefined while modules load in a cycle. */
export function isAdminToolError(err: unknown): boolean {
  return [
    InvalidObjectiveInputError,
    InvalidPolicyScopeError,
    CrossOrgUserAccessError,
    NotAuthorizedError,
    ObjectiveNotAuthorizedError,
    ObjectiveNotFoundError,
    ObjectiveParentNotFoundError,
    ObjectiveScopeNotFoundError,
    PolicyNotAuthorizedError,
    PolicyNotFoundError,
    PolicyScopeNotFoundError,
    OrgSummaryNotAllowedError,
    AiNotEnabledError,
  ].some((ctor) => err instanceof ctor);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export async function invokeAdminTool(name: AdminToolName, rawArgs: unknown, ctx: McpToolContext): Promise<string> {
  assertCoreFeaturesEnabled();
  const needed = REQUIRED_SCOPE[name];
  if (!ctx.caller.scopes.includes(needed)) {
    throw new McpToolError(`this API key lacks the ${needed} scope needed for ${name}.`);
  }
  const args = z.object(adminToolInputSchemas[name]).parse(rawArgs ?? {}) as Record<string, any>;
  const orgId = ctx.caller.user.orgId;
  const actor = { organizationId: orgId, userId: ctx.caller.user.id };

  return withTenantContext(ctx.db, orgId, async (tx) => {
    const teamVerifier: PolicyScopeVerifier & ObjectiveScopeVerifier = {
      teamBelongsToOrganization: async (organizationId, id) => {
        try {
          await getTeam(tx, organizationId, id);
          return true;
        } catch {
          return false;
        }
      },
    };
    switch (name) {
      case "sh-admin-policy-list":
        return json(await listTeamPolicies(tx, actor, args.team_id));
      case "sh-admin-policy-create": {
        const { team_id, ...fields } = args;
        return json(await createPolicy(tx, actor, { teamId: team_id, ...fields } as never, teamVerifier, ctx.auditContext));
      }
      case "sh-admin-policy-update": {
        const { policy_id, ...fields } = args;
        return json(await updatePolicy(tx, actor, policy_id, fields, ctx.auditContext));
      }
      case "sh-admin-policy-delete":
        await deletePolicy(tx, actor, args.policy_id, ctx.auditContext);
        return "Policy deleted.";
      case "sh-admin-objective-list":
        return json(await listTeamObjectives(tx, actor, args.team_id));
      case "sh-admin-objective-create": {
        const { team_id, ...fields } = args;
        return json(await createObjective(tx, actor, { teamId: team_id, ...fields } as never, teamVerifier, ctx.auditContext));
      }
      case "sh-admin-objective-update": {
        const { objective_id, ...fields } = args;
        return json(await updateObjective(tx, actor, objective_id, fields, teamVerifier, ctx.auditContext));
      }
      case "sh-admin-objective-delete":
        await deleteObjective(tx, actor, args.objective_id, ctx.auditContext);
        return "Objective deleted.";
      case "sh-admin-objective-summary": {
        const result = await summarizeObjectives(
          tx,
          { ...actor, role: ctx.caller.user.role },
          args.team_id ? { kind: "team", teamId: args.team_id } : { kind: "org" },
          undefined,
          true,
        );
        return json(result);
      }
      case "sh-metrics-summary": {
        const to = args.to ? new Date(`${args.to}T23:59:59.999Z`) : new Date();
        const from = args.from ? new Date(`${args.from}T00:00:00.000Z`) : new Date(to.getTime() - 30 * MS_PER_DAY);
        return json(await getPromptUsageSummaryForOrganization(tx, orgId, { window: { from, to } }));
      }
      default:
        return name satisfies never;
    }
  });
}
