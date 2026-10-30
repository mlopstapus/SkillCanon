import { describe, expect, it, vi } from "vitest";
import { createAnthropicEvalProvider, createOpenAIEvalProvider } from "./eval-providers";
import { openSecret, sealSecret } from "./secret-box";

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("eval providers", () => {
  it("anthropic: sends the key, returns text and summed tokens", async () => {
    const f = vi.fn(() => json({ content: [{ type: "text", text: "hi" }], usage: { input_tokens: 3, output_tokens: 4 } }));
    const out = await createAnthropicEvalProvider("k1", f as unknown as typeof fetch).complete({ model: "m", system: "s", user: "u" });
    expect(out).toEqual({ text: "hi", tokens: 7 });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k1");
  });

  it("openai: bearer auth, reads choices and usage", async () => {
    const f = vi.fn(() => json({ choices: [{ message: { content: "yo" } }], usage: { total_tokens: 9 } }));
    const out = await createOpenAIEvalProvider("k2", f as unknown as typeof fetch).complete({ model: "m", system: "s", user: "u" });
    expect(out).toEqual({ text: "yo", tokens: 9 });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k2");
  });

  it("a non-2xx response throws without echoing the key", async () => {
    const f = vi.fn(() => json({}, 401));
    await expect(createOpenAIEvalProvider("k3", f as unknown as typeof fetch).complete({ model: "m", system: "", user: "" })).rejects.toThrow("HTTP 401");
  });

  it("secret box round-trips, is non-deterministic and rejects tampering", () => {
    const a = sealSecret("sk-abc", "s");
    expect(a).not.toContain("sk-abc");
    expect(sealSecret("sk-abc", "s")).not.toBe(a);
    expect(openSecret(a, "s")).toBe("sk-abc");
    expect(() => openSecret(a, "other")).toThrow();
  });
});
