import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "u1", orgId: "org-1", role: "admin" as const } as {
    id: string;
    orgId: string;
    role: "admin" | "member";
  } | null,
  tenantOrganizationIds: [] as string[],
  transfers: [] as Array<{
    tx: unknown;
    actingUser: unknown;
    skillId: string;
    params: { newOwnerType: "user" | "team"; newOwnerId: string };
  }>,
  revalidatedPaths: [] as string[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=test" }) }));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    state.revalidatedPaths.push(path);
  },
}));
vi.mock("@/bcs/identity-access", () => ({ authenticateSession: async () => state.user }));
vi.mock("@/shared/db", () => ({
  authDb: {},
  db: {},
  withTenantContext: async (_db: unknown, organizationId: string, run: (tx: unknown) => unknown) => {
    state.tenantOrganizationIds.push(organizationId);
    return run({ kind: "tenant-transaction" });
  },
}));
vi.mock("@/bcs/prompt-registry", () => ({
  transferSkillOwnership: async (
    tx: unknown,
    actingUser: unknown,
    skillId: string,
    params: { newOwnerType: "user" | "team"; newOwnerId: string },
  ) => {
    state.transfers.push({ tx, actingUser, skillId, params });
  },
}));

import * as promptActions from "./actions";

type TransferAction = (
  skillId: string,
  promptName: string,
  params: { newOwnerType: "user" | "team"; newOwnerId: string },
) => Promise<{ ok: true } | { ok: false; error: string }>;

describe("transferSkillOwnershipAction", () => {
  beforeEach(() => {
    state.user = { id: "u1", orgId: "org-1", role: "admin" };
    state.tenantOrganizationIds.length = 0;
    state.transfers.length = 0;
    state.revalidatedPaths.length = 0;
  });

  it("authenticates, transfers inside the actor tenant, and revalidates list and detail paths", async () => {
    const action = (promptActions as unknown as { transferSkillOwnershipAction?: TransferAction })
      .transferSkillOwnershipAction;
    expect(action).toBeTypeOf("function");
    if (!action) return;

    const result = await action("skill-1", "commit-message", {
      newOwnerType: "team",
      newOwnerId: "team-2",
    });

    expect(result).toEqual({ ok: true });
    expect(state.tenantOrganizationIds).toEqual(["org-1"]);
    expect(state.transfers).toEqual([
      {
        tx: { kind: "tenant-transaction" },
        actingUser: { id: "u1", orgId: "org-1", role: "admin" },
        skillId: "skill-1",
        params: { newOwnerType: "team", newOwnerId: "team-2" },
      },
    ]);
    expect(state.revalidatedPaths).toEqual(["/prompts", "/prompts/commit-message"]);
  });
});
