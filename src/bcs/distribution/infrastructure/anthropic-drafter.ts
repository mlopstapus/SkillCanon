import {
  DraftFailedError,
  type DraftedImprovement,
  type ImprovementDraftInput,
  type ImprovementDrafter,
} from "../domain/improvement-draft";

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5-5";

const SYSTEM_PROMPT = `You improve "skill" files (markdown instructions that an AI assistant follows).
You are given the current skill file and feedback notes from people who used it.
Revise the file so it addresses the feedback while keeping everything that works. Do not invent requirements the notes do not support.
Reply with ONLY a JSON object: {"content": "<the full revised skill file>", "rationale": "<two or three sentences on what changed and why>"}.`;

/** Anthropic Messages API drafter, env-configured until the operator provider pool (017/003) exists. */
export function createAnthropicDrafter(apiKey: string, model: string = DEFAULT_MODEL, fetchImpl: typeof fetch = fetch): ImprovementDrafter {
  return {
    model: `anthropic/${model}`,
    async draft(input: ImprovementDraftInput, signal: AbortSignal): Promise<DraftedImprovement> {
      const userMessage = [
        `Skill: ${input.skillName}`,
        "",
        "Current skill file:",
        "<skill>",
        input.currentContent,
        "</skill>",
        "",
        "Feedback notes:",
        ...input.notes.map((note, i) => `${i + 1}. ${note}`),
      ].join("\n");

      const response = await fetchImpl(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
        signal,
      });
      if (!response.ok) throw new DraftFailedError(`the provider returned HTTP ${response.status}.`);
      const body = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = body.content?.find((block) => block.type === "text")?.text ?? "";
      return parseDraft(text);
    },
  };
}

/** Accepts the JSON object bare or inside a code fence; anything else is a failed draft. */
export function parseDraft(text: string): DraftedImprovement {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new DraftFailedError("the reply was not valid JSON.");
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { content?: unknown; rationale?: unknown };
    if (typeof parsed.content !== "string" || parsed.content.trim() === "") {
      throw new DraftFailedError("the reply had no revised content.");
    }
    return { content: parsed.content, rationale: typeof parsed.rationale === "string" ? parsed.rationale : "" };
  } catch (err) {
    if (err instanceof DraftFailedError) throw err;
    throw new DraftFailedError("the reply was not valid JSON.");
  }
}

/** The env-configured drafter, or null when no provider key is set. */
export function resolveEnvDrafter(env: NodeJS.ProcessEnv = process.env): ImprovementDrafter | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  return key ? createAnthropicDrafter(key, env.DRAFTER_MODEL?.trim() || DEFAULT_MODEL) : null;
}
