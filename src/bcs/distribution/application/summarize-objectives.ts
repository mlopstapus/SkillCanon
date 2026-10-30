import { createHash } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { listTeamObjectives, resolveEffectiveObjectivesForTeam } from "@/bcs/governance";
import { listTeams } from "@/bcs/identity-access";
import { getEvalProviderPool, getEvalsEnabled, type EvalProviderPool } from "@/bcs/prompt-registry";
import { getLogger } from "@/shared/logging";
import { AiNotEnabledError, AiPoolNotConfiguredError } from "./governance-interview";

type Db = PostgresJsDatabase<Record<string, never>>;

export type SummaryScope = { kind: "team"; teamId: string } | { kind: "org" };

export interface ObjectiveSummary {
  summary: string;
  objectiveCount: number;
  /** True when the summary came from the cache and no model was called. */
  cached: boolean;
}

/** An org-wide rollup was requested by someone who is not an admin. */
export class OrgSummaryNotAllowedError extends Error {
  constructor() {
    super("Only an organization admin can summarize objectives across the whole organization.");
    this.name = "OrgSummaryNotAllowedError";
  }
}

const SYSTEM_PROMPT = `You summarize a team's objectives for its members. Write 3-6 short sentences or bullets that say what the group is driving toward, group related objectives, and call out themes or conflicts. Use only the objectives given; do not invent any. Plain text, no preamble.`;

// shortcut: process-local cache (lost on restart, not shared between instances); upgrade to a table if summaries must survive deploys.
const MAX_CACHED = 200;
const cache = new Map<string, string>();

export function clearObjectiveSummaryCache() {
  cache.clear();
}

async function gatherObjectives(
  db: Db,
  actor: { organizationId: string; userId: string },
  scope: SummaryScope,
): Promise<string[]> {
  if (scope.kind === "team") {
    const set = await resolveEffectiveObjectivesForTeam(db, actor, scope.teamId);
    return [...set.inherited, ...set.local].map((o) => `${o.title}${o.description ? `: ${o.description}` : ""}`);
  }
  const teams = await listTeams(db, actor.organizationId);
  const lines: string[] = [];
  for (const team of teams) {
    for (const o of await listTeamObjectives(db, actor, team.id)) {
      lines.push(`[${team.name}] ${o.title}${o.description ? `: ${o.description}` : ""}`);
    }
  }
  return lines;
}

/**
 * Summarizes a team's effective objectives, or (admins only) every team's.
 * Input is objective titles and descriptions only. The summary is cached by a
 * hash of that input, so a model is called only when the objectives change.
 */
export async function summarizeObjectives(
  db: Db,
  actor: { organizationId: string; userId: string; role: "admin" | "member" },
  scope: SummaryScope,
  pool: EvalProviderPool = getEvalProviderPool(),
  /** Return only an already-cached summary; never call a model. */
  cachedOnly = false,
): Promise<ObjectiveSummary> {
  if (scope.kind === "org" && actor.role !== "admin") {
    throw new OrgSummaryNotAllowedError();
  }
  if (!(await getEvalsEnabled(db, actor.organizationId))) {
    throw new AiNotEnabledError();
  }
  const lines = await gatherObjectives(db, actor, scope);
  if (lines.length === 0) {
    return { summary: "No objectives to summarize.", objectiveCount: 0, cached: false };
  }

  const key = `${actor.organizationId}:${scope.kind === "team" ? scope.teamId : "org"}:${createHash("sha256").update(lines.join("\n")).digest("hex")}`;
  const hit = cache.get(key);
  if (hit !== undefined) {
    return { summary: hit, objectiveCount: lines.length, cached: true };
  }

  if (cachedOnly) {
    return { summary: "No summary has been generated for the current objectives yet; generate one from the Objectives tab.", objectiveCount: lines.length, cached: false };
  }

  const modelId = pool.defaultJudge ?? pool.models[0];
  const provider = modelId ? pool.providers.find((p) => modelId.startsWith(`${p.id}/`)) : undefined;
  if (!modelId || !provider) {
    throw new AiPoolNotConfiguredError();
  }
  const completion = await provider.complete({
    model: modelId.slice(provider.id.length + 1),
    system: SYSTEM_PROMPT,
    user: lines.map((line) => `- ${line}`).join("\n"),
  });
  getLogger("distribution").info(
    { orgId: actor.organizationId, userId: actor.userId, model: modelId, tokens: completion.tokens },
    "objective summary completion",
  );
  const summary = completion.text.trim();
  if (cache.size >= MAX_CACHED) {
    cache.delete(cache.keys().next().value as string);
  }
  cache.set(key, summary);
  return { summary, objectiveCount: lines.length, cached: false };
}
