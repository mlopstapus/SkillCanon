import { describe, expect, it } from "vitest";
import { _test } from "./route";

describe("/mcp route", () => {
  it("rejects missing bearer credentials without tenant-scoped dependencies", async () => {
    const response = await _test.handleMcpRequest(new Request("http://x/mcp", { method: "POST" }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.message).toBe("Authentication required");
  });

  it("does not echo raw API key material on malformed non-initialize requests", async () => {
    const rawKey = "sh_super_secret_raw_key_value";
    const response = await _test.handleMcpRequest(
      new Request("http://x/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${rawKey}`, "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      }),
      {
        authDb: {} as never,
        db: {} as never,
      },
    );

    const text = await response.text();
    expect(text).not.toContain(rawKey);
    expect(text).not.toContain(rawKey.slice(0, 8));
  });
});
