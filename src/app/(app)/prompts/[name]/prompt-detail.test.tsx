// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { PromptDetailData } from "./prompt-detail-view";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const state = vi.hoisted(() => ({
  refreshCount: 0,
  transfers: [] as Array<{
    skillId: string;
    promptName: string;
    params: { newOwnerType: "user" | "team"; newOwnerId: string };
  }>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    refresh: () => {
      state.refreshCount += 1;
    },
  }),
}));
vi.mock("../actions", () => ({
  deprecatePromptAction: async () => ({ ok: true }),
  forkSkillForSelfAction: async () => ({ ok: true }),
  getSkillChainRunAction: async () => ({ ok: false, error: "unused" }),
  listSkillChainRunsAction: async () => ({ ok: false, error: "unused" }),
  publishVersionAction: async () => ({ ok: true }),
  reactivatePromptAction: async () => ({ ok: true }),
  rollbackPromptAction: async () => ({ ok: true }),
  subscribeSkillAction: async () => ({ ok: true }),
  transferSkillOwnershipAction: async (
    skillId: string,
    promptName: string,
    params: { newOwnerType: "user" | "team"; newOwnerId: string },
  ) => {
    state.transfers.push({ skillId, promptName, params });
    return { ok: true };
  },
  unsubscribeSkillAction: async () => ({ ok: true }),
}));

import { PromptDetail } from "./prompt-detail";

const data: PromptDetailData = {
  id: "skill-1",
  name: "commit-message",
  description: "Writes commits",
  isDeprecated: false,
  ownerType: "user",
  ownerId: "u1",
  ownerLabel: "Alice Admin",
  isOwnSkill: true,
  canTransferOwnership: true,
  transferCandidates: {
    users: [{ id: "u2", name: "Bob Builder" }],
    teams: [{ id: "t2", name: "Platform" }],
  },
  sourceUrl: null,
  projectLabels: [],
  activeVersion: null,
  versions: [],
  kind: "template",
  hasActiveVersion: false,
  isLegacyShape: false,
  files: [],
  legacySystemTemplate: null,
  legacyUserTemplate: null,
  preview: null,
  previewError: null,
  appliedPolicies: [],
  steps: null,
  chainRuns: null,
  shareState: { users: [], teams: [], projects: [] },
  shareSummary: { teamCount: 0, subscriberCount: 0, copyCount: 0 },
  accessibleSkillNames: [],
};

describe("PromptDetail ownership-transfer wiring", () => {
  it("opens the transfer drawer and refreshes after confirming through the Server Action", async () => {
    state.refreshCount = 0;
    state.transfers.length = 0;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<PromptDetail data={data} />));
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Transfer ownership")
        ?.click();
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Platform")?.click();
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
        .find((button) => button.textContent === "Transfer ownership")
        ?.click();
    });

    expect(state.transfers).toEqual([
      {
        skillId: "skill-1",
        promptName: "commit-message",
        params: { newOwnerType: "team", newOwnerId: "t2" },
      },
    ]);
    expect(state.refreshCount).toBe(1);
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });
});
