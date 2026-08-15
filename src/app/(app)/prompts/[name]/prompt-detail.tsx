"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  deprecatePromptAction,
  forkSkillForSelfAction,
  getSkillChainRunAction,
  listSkillChainRunsAction,
  publishVersionAction,
  reactivatePromptAction,
  rollbackPromptAction,
  subscribeSkillAction,
  unsubscribeSkillAction,
} from "../actions";
import { CopySkillDrawer } from "./copy-skill-drawer";
import { NewVersionDrawer } from "./new-version-drawer";
import {
  PromptDetailView,
  type ChainRunStepView,
  type PromptDetailData,
  type PromptDetailTab,
} from "./prompt-detail-view";
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
  const [activeTab, setActiveTab] = useState<PromptDetailTab>(data.kind === "chain" ? "steps" : "overview");
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargetName, setCopyTargetName] = useState<string | null>(null);
  const [chainRunsPage, setChainRunsPage] = useState(data.chainRuns);
  const [runStepsByRunId, setRunStepsByRunId] = useState<Record<string, ChainRunStepView[] | undefined>>({});

  return (
    <>
      <PromptDetailView
        data={data}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        chainRunsPage={chainRunsPage}
        onRunsPageChange={async (page) => {
          const result = await listSkillChainRunsAction(data.id, page);
          if (result.ok) {
            setChainRunsPage({
              items: result.items.map((run) => ({
                id: run.id,
                version: run.version,
                status: run.status,
                startedAt: run.startedAt.toISOString().slice(0, 16).replace("T", " "),
              })),
              page: result.page,
              pageSize: result.pageSize,
              total: result.total,
            });
          }
        }}
        runStepsByRunId={runStepsByRunId}
        onRequestRunSteps={async (runId) => {
          if (runStepsByRunId[runId]) {
            return;
          }
          const result = await getSkillChainRunAction(runId);
          if (result.ok) {
            setRunStepsByRunId((prev) => ({
              ...prev,
              [runId]: result.steps.map((step) => ({
                stepIndex: step.stepIndex,
                promptName: step.promptName,
                promptVersion: step.promptVersion,
                content: step.content,
                reportedStatus: step.reportedStatus,
                reportedError: step.reportedError,
              })),
            }));
          }
        }}
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
        onFork={() => setCopyOpen(true)}
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
          mainFileContent={data.files.find((f) => f.isMain)?.content ?? ""}
          supportingFiles={data.files.filter((f) => !f.isMain).map(({ name, content }) => ({ name, content }))}
          tags={data.versions.find((v) => v.isActive)?.tags ?? []}
          activeVersionKind={data.kind}
          activeVersionSteps={(data.steps ?? []).map((s) => ({
            id: s.id,
            promptName: s.promptName,
            promptVersion: s.promptVersionLabel ?? "",
            dependsOn: s.dependsOn,
          }))}
          accessibleSkillNames={data.accessibleSkillNames}
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
      {copyOpen ? (
        <CopySkillDrawer
          sourceName={data.name}
          sourceDescription={data.description}
          onClose={() => setCopyOpen(false)}
          onSubmit={async (values) => {
            const result = await forkSkillForSelfAction(data.id, values);
            if (result.ok) {
              setCopyOpen(false);
              setCopyTargetName(values.name);
            }
            return result;
          }}
        />
      ) : null}
      {copyTargetName ? (
        <NewVersionDrawer
          promptName={copyTargetName}
          nextVersionLabel="v1"
          mainFileContent={
            data.isLegacyShape
              ? `System template:\n${data.legacySystemTemplate ?? ""}\n\nUser template:\n${data.legacyUserTemplate ?? ""}`
              : (data.files.find((f) => f.isMain)?.content ?? "")
          }
          supportingFiles={
            data.isLegacyShape ? [] : data.files.filter((f) => !f.isMain).map(({ name, content }) => ({ name, content }))
          }
          tags={data.versions.find((v) => v.isActive)?.tags ?? []}
          activeVersionKind={data.kind}
          activeVersionSteps={(data.steps ?? []).map((s) => ({
            id: s.id,
            promptName: s.promptName,
            promptVersion: s.promptVersionLabel ?? "",
            dependsOn: s.dependsOn,
          }))}
          accessibleSkillNames={data.accessibleSkillNames}
          onClose={() => setCopyTargetName(null)}
          onSubmit={async (values) => {
            const result = await publishVersionAction({ promptName: copyTargetName, ...values });
            if (result.ok) {
              setCopyTargetName(null);
              router.push(`/prompts/${copyTargetName}`);
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
    </>
  );
}
