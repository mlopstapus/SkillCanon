import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ApiKeySummary, AppSessionUser } from "@/bcs/identity-access";
import { ApiKeysListView } from "./api-keys-list";

const now = new Date("2026-01-01T00:00:00Z");

const adminSession: AppSessionUser = {
  id: "user-1",
  orgId: "org-1",
  teamId: "team-1",
  role: "admin",
  email: "admin@example.com",
  displayName: "Admin",
  teamName: "Root",
};

const activeKey: ApiKeySummary = {
  id: "key-1",
  userId: "user-1",
  name: "CI deploy key",
  prefix: "sk_live_a3f1",
  scopes: ["prompts:read", "workflows:run"],
  expiresAt: null,
  isActive: true,
  lastUsedAt: now,
  createdAt: now,
};

const revokedKey: ApiKeySummary = {
  ...activeKey,
  id: "key-2",
  name: "Legacy IDE token",
  isActive: false,
};

const noop = () => {};

describe("ApiKeysListView", () => {
  it("lists keys with name, prefix, scopes, and status — never the raw value", () => {
    const markup = renderToStaticMarkup(
      <ApiKeysListView currentUser={adminSession} keys={[activeKey]} refresh={noop} />,
    );

    expect(markup).toContain("CI deploy key");
    expect(markup).toContain("sk_live_a3f1");
    expect(markup).toContain("prompts:read");
    expect(markup).toContain("active");
    expect(markup).not.toMatch(/sk_live_a3f1[a-zA-Z0-9_-]{10,}/);
  });

  it("marks a revoked key as revoked and hides its Revoke control, while keeping it listed", () => {
    const markup = renderToStaticMarkup(
      <ApiKeysListView currentUser={adminSession} keys={[revokedKey]} refresh={noop} />,
    );

    expect(markup).toContain("Legacy IDE token");
    expect(markup).toContain("revoked");
    expect(markup).not.toContain(">Revoke<");
  });

  it("shows the empty state when there are no keys", () => {
    const markup = renderToStaticMarkup(
      <ApiKeysListView currentUser={adminSession} keys={[]} refresh={noop} />,
    );

    expect(markup).toContain("No API keys yet");
  });
});
