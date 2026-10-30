import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: false, setUp: false }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/shared/db", () => ({ authDb: {} }));
vi.mock("@/bcs/identity-access", () => ({ isInstanceSetUp: async () => state.setUp }));
vi.mock("./(auth)/auth-redirect", () => ({
  resolveAuthPageAccess: async () => (state.authenticated ? { status: "authenticated" } : { status: "unauthenticated" }),
}));

import Home from "./page";

describe("/", () => {
  beforeEach(() => {
    state.authenticated = false;
    state.setUp = false;
  });

  it("sends a signed-in visitor to the dashboard", async () => {
    state.authenticated = true;
    state.setUp = true;
    await expect(Home()).rejects.toThrow("redirect:/dashboard");
  });

  it("sends a signed-out visitor to first-run setup until an organization exists, then to sign-in", async () => {
    await expect(Home()).rejects.toThrow("redirect:/register");
    state.setUp = true;
    await expect(Home()).rejects.toThrow("redirect:/login");
  });
});
