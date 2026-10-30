import type { EvalProvider } from "../domain/eval-run";

export const EVAL_PROVIDER_IDS = ["anthropic", "openai"] as const;
export type EvalProviderId = (typeof EVAL_PROVIDER_IDS)[number];

async function post(url: string, headers: Record<string, string>, body: unknown, fetchImpl: typeof fetch) {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`provider returned HTTP ${res.status}`);
  return (await res.json()) as Record<string, any>;
}

export function createAnthropicEvalProvider(apiKey: string, fetchImpl: typeof fetch = fetch): EvalProvider {
  return {
    id: "anthropic",
    async complete({ model, system, user }) {
      const j = await post(
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        { model, max_tokens: 4096, system, messages: [{ role: "user", content: user }] },
        fetchImpl,
      );
      const text = j.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";
      return { text, tokens: (j.usage?.input_tokens ?? 0) + (j.usage?.output_tokens ?? 0) };
    },
  };
}

export function createOpenAIEvalProvider(apiKey: string, fetchImpl: typeof fetch = fetch): EvalProvider {
  return {
    id: "openai",
    async complete({ model, system, user }) {
      const j = await post(
        "https://api.openai.com/v1/chat/completions",
        { authorization: `Bearer ${apiKey}` },
        { model, messages: [{ role: "system", content: system }, { role: "user", content: user }] },
        fetchImpl,
      );
      return { text: j.choices?.[0]?.message?.content ?? "", tokens: j.usage?.total_tokens ?? 0 };
    },
  };
}

export function createEvalProvider(id: EvalProviderId, apiKey: string, fetchImpl?: typeof fetch): EvalProvider {
  return id === "anthropic" ? createAnthropicEvalProvider(apiKey, fetchImpl) : createOpenAIEvalProvider(apiKey, fetchImpl);
}
