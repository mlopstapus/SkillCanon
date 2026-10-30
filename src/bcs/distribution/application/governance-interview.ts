import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { resolveEffectiveObjectives, resolveEffectivePolicies } from "@/bcs/governance";
import { getEvalProviderPool, getEvalsEnabled, type EvalProviderPool } from "@/bcs/prompt-registry";
import { getLogger } from "@/shared/logging";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface InterviewMessage {
  role: "user" | "assistant";
  content: string;
}

export type InterviewDraft =
  | { kind: "policy"; name: string; enforcementType: "prepend" | "append" | "inject" | "validate"; content: string }
  | { kind: "objective"; title: string; description: string };

export interface InterviewResult {
  reply: string;
  drafts: InterviewDraft[];
  tokens: number;
}

/** The org has not opted in to sending data to a model provider. */
export class AiNotEnabledError extends Error {
  constructor() {
    super("AI features are off for this organization; an admin must opt in (same opt-in as evals).");
    this.name = "AiNotEnabledError";
  }
}

/** No provider/model is configured in the provider pool. */
export class AiPoolNotConfiguredError extends Error {
  constructor() {
    super("No model provider is configured; an admin must add one in the provider pool.");
    this.name = "AiPoolNotConfiguredError";
  }
}

const ENFORCEMENT = ["prepend", "append", "inject", "validate"];
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;

const SYSTEM_PROMPT = `You help a team turn a loose description of their goals and constraints into governance drafts for SkillCanon.
A policy has a name, an enforcementType (prepend | append | inject | validate) and content (instructions added to every skill run). An objective has a title and a description.
Ask at most one short clarifying question when you lack information; otherwise propose drafts. Do not repeat policies or objectives the team already has (listed below).
Reply with JSON only, no prose around it, in this shape:
{"reply": "<short message to the user>", "drafts": [{"kind":"policy","name":"...","enforcementType":"append","content":"..."},{"kind":"objective","title":"...","description":"..."}]}
Use an empty drafts array when you are only asking a question. These are drafts for a human to review; nothing is applied automatically.`;

/** Pulls the first JSON object out of a model reply and keeps only well-formed drafts. */
export function parseInterviewReply(text: string): { reply: string; drafts: InterviewDraft[] } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return { reply: text.trim(), drafts: [] };
  }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { reply?: unknown; drafts?: unknown };
    const drafts: InterviewDraft[] = [];
    for (const raw of Array.isArray(parsed.drafts) ? parsed.drafts : []) {
      const d = raw as Record<string, unknown>;
      if (d.kind === "policy" && typeof d.name === "string" && typeof d.content === "string" && d.name && d.content) {
        const enforcementType = ENFORCEMENT.includes(d.enforcementType as string)
          ? (d.enforcementType as "prepend" | "append" | "inject" | "validate")
          : "append";
        drafts.push({ kind: "policy", name: d.name, enforcementType, content: d.content });
      } else if (d.kind === "objective" && typeof d.title === "string" && d.title) {
        drafts.push({ kind: "objective", title: d.title, description: typeof d.description === "string" ? d.description : "" });
      }
    }
    return { reply: typeof parsed.reply === "string" ? parsed.reply : "", drafts };
  } catch {
    return { reply: text.trim(), drafts: [] };
  }
}

/**
 * One turn of the policy/tenet interview. Returns a reply and draft policies
 * or objectives; it never creates anything — a human applies a draft through
 * the normal create path. Runs inside the caller's tenant context.
 */
export async function runGovernanceInterview(
  db: Db,
  actor: { organizationId: string; userId: string },
  messages: InterviewMessage[],
  pool: EvalProviderPool = getEvalProviderPool(),
): Promise<InterviewResult> {
  if (!(await getEvalsEnabled(db, actor.organizationId))) {
    throw new AiNotEnabledError();
  }
  const modelId = pool.defaultJudge ?? pool.models[0];
  const provider = modelId ? pool.providers.find((p) => modelId.startsWith(`${p.id}/`)) : undefined;
  if (!modelId || !provider) {
    throw new AiPoolNotConfiguredError();
  }

  const [policies, objectives] = await Promise.all([
    resolveEffectivePolicies(db, actor, actor.userId),
    resolveEffectiveObjectives(db, actor, actor.userId),
  ]);
  const existing = [
    ...[...policies.inherited, ...policies.local].map((p) => `policy: ${p.name} — ${p.content}`),
    ...[...objectives.inherited, ...objectives.local].map((o) => `objective: ${o.title}`),
  ];
  const transcript = messages
    .slice(-MAX_MESSAGES)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, MAX_MESSAGE_CHARS)}`)
    .join("\n\n");

  const completion = await provider.complete({
    model: modelId.slice(provider.id.length + 1),
    system: `${SYSTEM_PROMPT}\n\nExisting governance:\n${existing.length ? existing.join("\n") : "(none)"}`,
    user: transcript,
  });
  // Per-org cost attribution: logged here until a shared usage store exists.
  getLogger("distribution").info(
    { orgId: actor.organizationId, userId: actor.userId, model: modelId, tokens: completion.tokens },
    "governance interview completion",
  );
  return { ...parseInterviewReply(completion.text), tokens: completion.tokens };
}
