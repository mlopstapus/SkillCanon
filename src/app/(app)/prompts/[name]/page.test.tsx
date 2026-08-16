import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PromptDetailData } from "./prompt-detail-view";

const fixture = vi.hoisted(() => ({
  user: { id: "u-current", orgId: "org-1", role: "member" as "admin" | "member" },
  prompt: {
    id: "skill-1",
    name: "commit-message",
    description: null,
    isDeprecated: false,
    ownerType: "user" as "user" | "team",
    ownerId: "u-current",
    sourceUrl: null,
    activeVersionId: null,
  },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/shared/db", () => ({
  authDb: {},
  db: {},
  withTenantContext: async (_db: unknown, _organizationId: string, run: (tx: unknown) => unknown) => run({}),
}));
vi.mock("@/bcs/identity-access", () => ({
  authenticateSession: async () => fixture.user,
  listUsers: async () => [
    { id: "u-current", displayName: "Current User" },
    { id: "u-other", displayName: "Other User" },
  ],
  listTeams: async () => [
    { id: "t-owned", name: "Owned Team", ownerId: "u-current" },
    { id: "t-other", name: "Other Team", ownerId: "u-other" },
  ],
}));
vi.mock("@/bcs/governance", () => ({ resolveAllPolicies: async () => [] }));
vi.mock("@/bcs/prompt-registry", () => ({
  countForksOfSkill: async () => 0,
  expand: async () => ({ content: "", appliedPolicies: [] }),
  getPrompt: async () => fixture.prompt,
  listPrompts: async () => [],
  listProjectSkillAssignmentsForOrganization: async () => [],
  listProjectsByOrganization: async () => [],
  listSkillChainRuns: async () => ({ items: [], page: 1, pageSize: 20, total: 0 }),
  listSubscriptionsForSkill: async () => [],
  listVersions: async () => [],
}));

import PromptDetailPage from "./page";

async function loadData(): Promise<PromptDetailData> {
  const element = (await PromptDetailPage({
    params: Promise.resolve({ name: "commit-message" }),
  })) as ReactElement<{ data: PromptDetailData }>;
  return element.props.data;
}

describe("PromptDetailPage ownership-transfer state", () => {
  beforeEach(() => {
    fixture.user.id = "u-current";
    fixture.user.role = "member";
    fixture.prompt.ownerType = "user";
    fixture.prompt.ownerId = "u-current";
  });

  it("excludes the current personal or team owner from the existing user/team candidate arrays", async () => {
    const personal = await loadData();
    expect(personal.transferCandidates).toEqual({
      users: [{ id: "u-other", name: "Other User" }],
      teams: [
        { id: "t-owned", name: "Owned Team" },
        { id: "t-other", name: "Other Team" },
      ],
    });

    fixture.prompt.ownerType = "team";
    fixture.prompt.ownerId = "t-owned";
    const team = await loadData();
    expect(team.transferCandidates).toEqual({
      users: [
        { id: "u-current", name: "Current User" },
        { id: "u-other", name: "Other User" },
      ],
      teams: [{ id: "t-other", name: "Other Team" }],
    });
  });

  it.each([
    { role: "admin", ownerType: "user", ownerId: "u-other", expected: true },
    { role: "member", ownerType: "user", ownerId: "u-current", expected: true },
    { role: "member", ownerType: "team", ownerId: "t-owned", expected: true },
    { role: "member", ownerType: "team", ownerId: "t-other", expected: false },
  ] as const)(
    "sets canTransferOwnership=$expected for $role acting on $ownerType:$ownerId",
    async ({ role, ownerType, ownerId, expected }) => {
      fixture.user.role = role;
      fixture.prompt.ownerType = ownerType;
      fixture.prompt.ownerId = ownerId;

      expect((await loadData()).canTransferOwnership).toBe(expected);
    },
  );
});
