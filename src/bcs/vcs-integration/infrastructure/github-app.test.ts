import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GithubApiError } from "../domain/installation";
import {
  createAppJwt,
  fetchInstallationAccount,
  getGithubAppConfig,
  mintInstallationToken,
  verifyWebhookSignature,
} from "./github-app";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const env = {
  GITHUB_APP_ID: "123",
  GITHUB_APP_SLUG: "skillcanon-test",
  GITHUB_APP_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
  GITHUB_APP_WEBHOOK_SECRET: "whsec",
};

describe("getGithubAppConfig", () => {
  it("is null unless all four settings are present", () => {
    expect(getGithubAppConfig({})).toBeNull();
    expect(getGithubAppConfig({ ...env, GITHUB_APP_ID: undefined })).toBeNull();
    expect(getGithubAppConfig(env)?.appId).toBe("123");
  });

  it("accepts a one-line PEM with literal \\n", () => {
    expect(getGithubAppConfig(env)?.privateKey).toBe(privateKey);
  });
});

describe("verifyWebhookSignature", () => {
  const sig = (body: string) => `sha256=${createHmac("sha256", "whsec").update(body).digest("hex")}`;
  it("accepts the right signature and rejects wrong, missing and altered ones", () => {
    expect(verifyWebhookSignature("whsec", "{}", sig("{}"))).toBe(true);
    expect(verifyWebhookSignature("whsec", "{}", sig("{ }"))).toBe(false);
    expect(verifyWebhookSignature("whsec", "{}", null)).toBe(false);
    expect(verifyWebhookSignature("other", "{}", sig("{}"))).toBe(false);
  });
});

describe("GitHub App calls", () => {
  const config = getGithubAppConfig(env)!;

  it("signs an RS256 app JWT that GitHub's public key verifies", () => {
    const jwt = createAppJwt(config, 1_700_000_000_000);
    const [h, p, s] = jwt.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(p, "base64url").toString()).iss).toBe("123");
    expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, s, "base64url")).toBe(true);
  });

  it("mints an installation token and never logs it or the private key", async () => {
    const logs: string[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...a) => void logs.push(a.join(" "))),
    );
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ token: "ghs_secret" }), { status: 201 })) as unknown as typeof fetch;
    expect(await mintInstallationToken(config, 7, fetchImpl)).toBe("ghs_secret");
    const failing = vi.fn(async () => new Response("{\"message\":\"nope ghs_secret\"}", { status: 401 })) as unknown as typeof fetch;
    const error = await mintInstallationToken(config, 7, failing).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GithubApiError);
    expect(String((error as Error).message)).not.toContain("ghs_secret");
    spies.forEach((s) => s.mockRestore());
    expect(logs.join("\n")).not.toContain("ghs_secret");
    expect(logs.join("\n")).not.toContain("PRIVATE KEY");
  });

  it("reads the account of an installation", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ account: { login: "acme", type: "Organization" } }))) as unknown as typeof fetch;
    expect(await fetchInstallationAccount(config, 7, fetchImpl)).toEqual({ login: "acme", type: "Organization" });
  });
});
