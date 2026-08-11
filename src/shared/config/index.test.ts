import { describe, expect, it } from "vitest";
import {
  getAppBaseUrl,
  getGithubToken,
  getInvitationExpiryHours,
  getJwtExpiryHours,
  getJwtSecret,
  getSmtpConfig,
} from "./index";

describe("getJwtSecret", () => {
  it("throws when the env var is missing", () => {
    expect(() => getJwtSecret({})).toThrow(/missing/i);
  });

  it("throws when the env var is empty", () => {
    expect(() => getJwtSecret({ JWT_SECRET: "" })).toThrow(/missing/i);
  });

  it("throws when the env var still equals the documented placeholder", () => {
    expect(() =>
      getJwtSecret({ JWT_SECRET: "REPLACE_ME_JWT_SECRET" }),
    ).toThrow(/placeholder/i);
  });

  it("returns the value when it is a real, non-placeholder secret", () => {
    expect(getJwtSecret({ JWT_SECRET: "a-real-signing-secret" })).toBe(
      "a-real-signing-secret",
    );
  });
});

describe("getJwtExpiryHours", () => {
  it("defaults to 24 when unset", () => {
    expect(getJwtExpiryHours({})).toBe(24);
  });

  it("returns a configured positive value", () => {
    expect(getJwtExpiryHours({ JWT_EXPIRY_HOURS: "48" })).toBe(48);
  });

  it("throws for a non-positive value", () => {
    expect(() => getJwtExpiryHours({ JWT_EXPIRY_HOURS: "0" })).toThrow();
    expect(() => getJwtExpiryHours({ JWT_EXPIRY_HOURS: "-1" })).toThrow();
  });
});

describe("getInvitationExpiryHours", () => {
  it("defaults to 168 (7 days) when unset", () => {
    expect(getInvitationExpiryHours({})).toBe(168);
  });

  it("returns a configured positive value", () => {
    expect(getInvitationExpiryHours({ INVITATION_EXPIRY_HOURS: "72" })).toBe(72);
  });

  it("throws for a non-positive value", () => {
    expect(() =>
      getInvitationExpiryHours({ INVITATION_EXPIRY_HOURS: "0" }),
    ).toThrow();
    expect(() =>
      getInvitationExpiryHours({ INVITATION_EXPIRY_HOURS: "-5" }),
    ).toThrow();
  });
});

describe("getAppBaseUrl", () => {
  it("defaults to http://localhost:3000 when unset", () => {
    expect(getAppBaseUrl({})).toBe("http://localhost:3000");
  });

  it("returns a configured value", () => {
    expect(getAppBaseUrl({ APP_BASE_URL: "https://app.example.com" })).toBe(
      "https://app.example.com",
    );
  });
});

describe("getSmtpConfig", () => {
  it("returns null when SMTP_HOST is unset", () => {
    expect(getSmtpConfig({})).toBeNull();
  });

  it("returns the full config when SMTP_HOST is set", () => {
    expect(
      getSmtpConfig({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "2525",
        SMTP_USER: "user",
        SMTP_PASS: "pass",
        SMTP_FROM: "SkillCanon <no-reply@example.com>",
      }),
    ).toEqual({
      host: "smtp.example.com",
      port: 2525,
      user: "user",
      pass: "pass",
      from: "SkillCanon <no-reply@example.com>",
    });
  });

  it("defaults port to 587 and from to a generic address when unset", () => {
    expect(getSmtpConfig({ SMTP_HOST: "smtp.example.com" })).toEqual({
      host: "smtp.example.com",
      port: 587,
      user: undefined,
      pass: undefined,
      from: "no-reply@example.com",
    });
  });
});

describe("getGithubToken", () => {
  it("returns null when GITHUB_TOKEN is unset (013-skill-import-and-external-registries)", () => {
    expect(getGithubToken({})).toBeNull();
  });

  it("returns null when GITHUB_TOKEN is an empty string", () => {
    expect(getGithubToken({ GITHUB_TOKEN: "" })).toBeNull();
  });

  it("returns the token when set", () => {
    expect(getGithubToken({ GITHUB_TOKEN: "ghp_example" })).toBe("ghp_example");
  });
});
