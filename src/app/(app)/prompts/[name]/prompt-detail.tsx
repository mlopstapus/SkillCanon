"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  assignSkillToProjectAction,
  deprecatePromptAction,
  forkSkillForSelfAction,
  publishVersionAction,
  reactivatePromptAction,
  rollbackPromptAction,
  subscribeSkillAction,
  unassignSkillFromProjectAction,
  unsubscribeSkillAction,
} from "../actions";
import { AssignProjectsDrawer } from "./assign-projects-drawer";
import { NewVersionDrawer } from "./new-version-drawer";
import { PromptDetailView, type PromptDetailData, type PromptDetailTab } from "./prompt-detail-view";
import { ShareDrawer } from "./share-drawer";
import { VersionHistoryDrawer } from "./version-history-drawer";

export interface PromptDetailProps {
  data: PromptDetailData;
}

function nextVersionLabel(versions: PromptDetailData["versions"]): string {
  const numbers = versions
    .map((v) => /^v(\d+)$/.exec(v.version)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `v${next}`;
}

/**
 * Thin client wrapper owning router context, active tab, and every drawer's
 * open/closed state — kept separate from the pure `PromptDetailView` per
 * this repo's View/wrapper split convention.
 */
export function PromptDetail({ data }: PromptDetailProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PromptDetailTab>("template");
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  return (
    <>
      <PromptDetailView
        data={data}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onDeprecate={async () => {
          await deprecatePromptAction(data.name);
          router.refresh();
        }}
        onReactivate={async () => {
          await reactivatePromptAction(data.name);
          router.refresh();
        }}
        onSetActiveVersion={async (version) => {
          await rollbackPromptAction(data.name, version);
          router.refresh();
        }}
        onOpenVersionHistory={() => setVersionHistoryOpen(true)}
        onOpenNewVersion={() => setNewVersionOpen(true)}
        onOpenShare={() => setShareOpen(true)}
        onOpenAssignProjects={() => setAssignOpen(true)}
        onFork={async () => {
          await forkSkillForSelfAction(data.id);
          router.push("/prompts");
        }}
      />
      {versionHistoryOpen ? (
        <VersionHistoryDrawer
          versions={data.versions}
          onClose={() => setVersionHistoryOpen(false)}
          onSetActive={async (version) => {
            await rollbackPromptAction(data.name, version);
            router.refresh();
          }}
        />
      ) : null}
      {newVersionOpen ? (
        <NewVersionDrawer
          promptName={data.name}
          nextVersionLabel={nextVersionLabel(data.versions)}
          systemTemplate={data.systemTemplate ?? ""}
          userTemplate={data.userTemplate ?? ""}
          tags={data.versions.find((v) => v.isActive)?.tags ?? []}
          onClose={() => setNewVersionOpen(false)}
          onSubmit={async (values) => {
            const result = await publishVersionAction({ promptName: data.name, ...values });
            if (result.ok) {
              setNewVersionOpen(false);
              router.refresh();
            }
            return result;
          }}
        />
      ) : null}
      {shareOpen ? (
        <ShareDrawer
          promptName={data.name}
          shareState={data.shareState}
          onClose={() => setShareOpen(false)}
          onToggleUser={async (userId, subscriptionId) => {
            if (subscriptionId) {
              await unsubscribeSkillAction(subscriptionId, data.name);
            } else {
              await subscribeSkillAction(data.id, data.name, { subscriberType: "user", subscriberId: userId });
            }
            router.refresh();
          }}
          onToggleTeam={async (teamId, subscriptionId) => {
            if (subscriptionId) {
              await unsubscribeSkillAction(subscriptionId, data.name);
            } else {
              await subscribeSkillAction(data.id, data.name, { subscriberType: "team", subscriberId: teamId });
            }
            router.refresh();
          }}
          onToggleProject={async (projectId, subscriptionId) => {
            if (subscriptionId) {
              await unsubscribeSkillAction(subscriptionId, data.name);
            } else {
              await subscribeSkillAction(data.id, data.name, { subscriberType: "project", subscriberId: projectId });
            }
            router.refresh();
          }}
        />
      ) : null}
      {assignOpen ? (
        <AssignProjectsDrawer
          promptName={data.name}
          assignments={data.projectAssignment}
          onClose={() => setAssignOpen(false)}
          onSetRequirement={async (projectId, requirement) => {
            if (requirement) {
              await assignSkillToProjectAction(projectId, data.id, requirement, data.name);
            } else {
              await unassignSkillFromProjectAction(projectId, data.id, data.name);
            }
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
