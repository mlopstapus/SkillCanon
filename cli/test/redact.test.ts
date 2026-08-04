import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { redact } from "../src/redact.js";

describe("redact", () => {
  it("redacts a real-shaped API key (sk_ + 32 random bytes base64url)", () => {
    const realKey = "sk_" + randomBytes(32).toString("base64url");
    const message = `The stored API key was rejected: ${realKey}`;
    expect(redact(message)).not.toContain(realKey);
    expect(redact(message)).toContain("sk_***REDACTED***");
  });

  it("leaves unrelated text untouched", () => {
    expect(redact("network error: connection refused")).toBe("network error: connection refused");
  });

  it("does not redact a short, incidental sk_ substring below the length floor", () => {
    expect(redact("field sk_ok is required")).toBe("field sk_ok is required");
  });
});
