"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/shared/ui";

export interface ChainStepView {
  id: string;
  promptName: string;
  /** `null` means "always uses the latest version" (FR-002). */
  promptVersionLabel: string | null;
  dependsOn: string[];
}

export interface ChainRunSummaryView {
  id: string;
  /** The chain version label this run executed (FR-005). */
  version: string;
  status: "in_progress" | "completed" | "failed" | "abandoned";
  startedAt: string;
}

export interface ChainRunStepView {
  stepIndex: number;
  promptName: string;
  promptVersion: string;
  systemMessage: string | null;
  userMessage: string;
  reportedStatus: "success" | "error" | null;
  reportedError: string | null;
}

export interface PromptDetailData {
  id: string;
  name: string;
  description: string;
  isDeprecated: boolean;
  ownerLabel: string;
  projectLabels: string[];
  activeVersion: string | null;
  versions: Array<{
    id: string;
    version: string;
    createdAt: string;
    tags: string[];
    isActive: boolean;
    kind: "template" | "chain";
    systemTemplate: string | null;
    stepCount: number;
  }>;
  /** Of the currently-active version. Drives which section set renders (FR-001). */
  kind: "template" | "chain";
  systemTemplate: string | null;
  userTemplate: string | null;
  inputSchemaRows: Array<{ name: string; type: string; required: boolean }>;
  preview: { systemMessage: string | null; userMessage: string } | null;
  previewError: string | null;
  appliedPolicies: Array<{ label: string; type: "prepend" | "append" | "inject" | "validate" }>;
  /** Non-null only when `kind === "chain"` (FR-002). */
  steps: ChainStepView[] | null;
  /** Initial (page 1) run history; non-null only when `kind === "chain"` (FR-005). */
  chainRuns: { items: ChainRunSummaryView[]; page: number; pageSize: number; total: number } | null;
  shareState: {
    users: Array<{ id: string; name: string; granted: boolean; subscriptionId: string | null }>;
    teams: Array<{ id: string; name: string; granted: boolean; subscriptionId: string | null }>;
    projects: Array<{ id: string; name: string; granted: boolean; subscriptionId: string | null }>;
  };
  projectAssignment: Array<{ projectId: string; projectName: string; requirement: "required" | "optional" | null }>;
  /** Skills the current user can access — powers the chain step builder's target-skill picker (FR-011). */
  accessibleSkillNames: string[];
}

export type PromptDetailTab = "template" | "preview" | "policies" | "steps" | "runs";

export interface PromptDetailViewProps {
  data: PromptDetailData;
  activeTab: PromptDetailTab;
  onTabChange: (tab: PromptDetailTab) => void;
  onDeprecate: () => void;
  onReactivate: () => void;
  onSetActiveVersion: (version: string) => void;
  onOpenVersionHistory: () => void;
  onOpenNewVersion: () => void;
  onOpenShare: () => void;
  onOpenAssignProjects: () => void;
  onFork: () => void;
  /** Currently-displayed run history page (replaces `data.chainRuns` after a page change). */
  chainRunsPage: PromptDetailData["chainRuns"];
  onRunsPageChange: (page: number) => void;
  /** A run's step detail, keyed by run id; absent until `onRequestRunSteps` resolves for that run. */
  runStepsByRunId: Record<string, ChainRunStepView[] | undefined>;
  onRequestRunSteps: (runId: string) => void;
}

const POLICY_BADGE: Record<string, "blue" | "violet" | "green" | "red"> = {
  prepend: "blue",
  append: "violet",
  inject: "green",
  validate: "red",
};

const RUN_STATUS_BADGE: Record<ChainRunSummaryView["status"], "blue" | "green" | "red" | "neutral"> = {
  in_progress: "blue",
  completed: "green",
  failed: "red",
  abandoned: "neutral",
};

export function PromptDetailView({
  data,
  activeTab,
  onTabChange,
  onDeprecate,
  onReactivate,
  onSetActiveVersion,
  onOpenVersionHistory,
  onOpenNewVersion,
  onOpenShare,
  onOpenAssignProjects,
  onFork,
  chainRunsPage,
  onRunsPageChange,
  runStepsByRunId,
  onRequestRunSteps,
}: PromptDetailViewProps) {
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [expandedStepKeys, setExpandedStepKeys] = useState<Set<string>>(new Set());
  const totalGrants = data.shareState.teams.filter((t) => t.granted).length +
    data.shareState.projects.filter((p) => p.granted).length;

  function toggleStep(runId: string, stepIndex: number) {
    if (!runStepsByRunId[runId]) {
      onRequestRunSteps(runId);
    }
    const key = `${runId}:${stepIndex}`;
    setExpandedStepKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-bg px-6.5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9.5 shrink-0 place-items-center rounded-tile bg-gradient-to-br from-a to-a-2 font-mono text-[14px] font-bold text-a-fg shadow-glow">
              {data.name[0]?.toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-[20px] font-bold tracking-tight">{data.name}</h1>
                {data.isDeprecated ? <Badge>deprecated</Badge> : null}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setVersionMenuOpen((v) => !v)}
                    className="flex items-center gap-1.5 rounded-pill border border-border-2 bg-surface px-2.5 py-1 font-mono text-[11px] text-a"
                  >
                    {data.activeVersion ? `${data.activeVersion} · active` : "no version"}
                  </button>
                  {versionMenuOpen ? (
                    <div className="absolute top-[calc(100%+6px)] left-0 z-30 min-w-[230px] rounded-card border border-border-2 bg-raise p-1.5 shadow-heavy">
                      {data.versions.slice(0, 4).map((v) => (
                        <div key={v.id} className="flex items-center gap-2 rounded-control px-2 py-1.5">
                          <span className="flex-1 font-mono text-[12px] text-text">
                            {v.version} <span className="text-faint">· {v.createdAt}</span>
                          </span>
                          {v.isActive ? (
                            <span className="font-mono text-[9.5px] text-a">active</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                onSetActiveVersion(v.version);
                                setVersionMenuOpen(false);
                              }}
                              className="rounded-[6px] border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-dim"
                            >
                              Set active
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          onOpenVersionHistory();
                          setVersionMenuOpen(false);
                        }}
                        className="mt-1 w-full border-t border-border px-2 py-1.5 text-left font-mono text-[11px] text-dim"
                      >
                        View full history →
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {data.projectLabels.map((label) => (
                  <Badge key={label} variant="violet">
                    {label}
                  </Badge>
                ))}
                <span className="font-mono text-[11px] text-dim">{data.ownerLabel}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onOpenAssignProjects}
              className="rounded-control border border-border-2 bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-dim"
            >
              Projects
            </button>
            <button
              type="button"
              onClick={onOpenShare}
              className="rounded-control border border-border-2 bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-dim"
            >
              Share
            </button>
            <button
              type="button"
              onClick={onFork}
              className="rounded-control border border-border-2 bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-dim"
            >
              Make a copy
            </button>
            <button
              type="button"
              onClick={onOpenNewVersion}
              className="rounded-control bg-a px-3.5 py-2 text-[12.5px] font-semibold text-a-fg shadow-glow"
            >
              + New version
            </button>
            {data.isDeprecated ? (
              <button
                type="button"
                onClick={onReactivate}
                className="rounded-control border border-border-2 bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-dim"
              >
                Reactivate
              </button>
            ) : (
              <button
                type="button"
                onClick={onDeprecate}
                className="rounded-control border border-border-2 bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-dim"
              >
                Deprecate
              </button>
            )}
          </div>
        </div>
        <p className="max-w-[640px] pb-3.5 text-[12.5px] leading-relaxed text-dim">{data.description}</p>
        {totalGrants > 0 ? (
          <button
            type="button"
            onClick={onOpenShare}
            className="mb-3.5 inline-flex items-center gap-1.5 rounded-pill border border-border-2 bg-surface px-3 py-1.5 font-mono text-[11px] text-dim"
          >
            Shared with {data.shareState.teams.filter((t) => t.granted).length} teams ·{" "}
            {data.shareState.projects.filter((p) => p.granted).length} projects
          </button>
        ) : null}
        <div className="flex gap-0.5 border-b border-border">
          {(
            data.kind === "chain"
              ? ([
                  ["steps", `Steps (${data.steps?.length ?? 0})`],
                  ["runs", "Run history"],
                ] as const)
              : ([
                  ["template", "Template"],
                  ["preview", "Preview"],
                  ["policies", `Applied policies (${data.appliedPolicies.length})`],
                ] as const)
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onTabChange(key)}
              className={`px-3.5 py-2.5 text-[13px] font-semibold ${
                activeTab === key ? "border-b-2 border-a text-text" : "border-b-2 border-transparent text-faint"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6.5 py-5">
        {activeTab === "template" ? (
          <div className="flex flex-col gap-4">
            <TemplateBlock label="System template" content={data.systemTemplate} />
            <TemplateBlock label="User template" content={data.userTemplate} />
            {data.inputSchemaRows.length > 0 ? (
              <div>
                <div className="mb-2 font-mono text-[10px] tracking-[0.08em] text-faint uppercase">Input schema</div>
                <div className="flex flex-col gap-1.5">
                  {data.inputSchemaRows.map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center gap-2.5 rounded-control border border-border bg-surface px-3.5 py-2.5"
                    >
                      <span className="font-mono text-[12.5px] text-text">{f.name}</span>
                      <Badge variant="blue">{f.type}</Badge>
                      <span className="ml-auto font-mono text-[10px] text-faint">
                        {f.required ? "required" : "optional"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "preview" ? (
          data.previewError ? (
            <div className="rounded-card border border-red/30 bg-red-soft p-4 text-[12.5px] text-red">
              {data.previewError}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <TemplateBlock label="Rendered system message" content={data.preview?.systemMessage ?? null} accent />
              <TemplateBlock label="Rendered user message" content={data.preview?.userMessage ?? null} accent />
            </div>
          )
        ) : null}

        {activeTab === "policies" ? (
          data.appliedPolicies.length === 0 ? (
            <div role="status" className="py-10 text-center text-[12.5px] text-dim">No governance policies applied.</div>
          ) : (
            <div className="overflow-hidden rounded-card border border-border">
              {data.appliedPolicies.map((p) => (
                <div key={p.label} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                  <Badge variant={POLICY_BADGE[p.type]}>{p.type}</Badge>
                  <span className="text-[12.5px] text-text">{p.label}</span>
                </div>
              ))}
            </div>
          )
        ) : null}

        {activeTab === "steps" ? (
          !data.steps || data.steps.length === 0 ? (
            <div role="status" className="py-10 text-center text-[12.5px] text-dim">No steps defined.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex gap-2 rounded-card border border-violet/25 bg-violet-soft p-3 text-[11.5px] text-dim">
                Each step resolves through this skill&apos;s own expansion — a caller (Claude Code, another
                agent) walks these steps and runs them; this page only shows the definition and past runs.
              </div>
              {data.steps.map((step, i) => (
                <Link
                  key={step.id}
                  href={`/prompts/${step.promptName}`}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-3"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-control border border-border-2 bg-surface-2 font-mono text-[11px] text-a">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold text-text">{step.promptName}</span>
                      <Badge variant="accent">{step.promptVersionLabel ?? "latest"}</Badge>
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-faint">
                      depends on: {step.dependsOn.length > 0 ? step.dependsOn.join(", ") : "nothing"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : null}

        {activeTab === "runs" ? (
          !chainRunsPage || chainRunsPage.items.length === 0 ? (
            <div role="status" className="rounded-card border border-border py-8 text-center text-[12.5px] text-dim">
              No runs yet. Runs happen client-side — this fills in once a caller reports progress via the
              chain-run API.
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {chainRunsPage.items.map((run) => {
                  const steps = runStepsByRunId[run.id];
                  return (
                    <div key={run.id} className="overflow-hidden rounded-card border border-border">
                      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
                        <Badge variant={RUN_STATUS_BADGE[run.status]}>{run.status}</Badge>
                        <span className="font-mono text-[12px] text-text">{run.startedAt}</span>
                        <span className="font-mono text-[10.5px] text-faint">{run.version}</span>
                      </div>
                      {steps === undefined ? (
                        <button
                          type="button"
                          onClick={() => toggleStep(run.id, 0)}
                          className="w-full px-4 py-3 text-left font-mono text-[11.5px] text-faint"
                        >
                          Load steps…
                        </button>
                      ) : (
                        steps.map((sd) => {
                          const key = `${run.id}:${sd.stepIndex}`;
                          const expanded = expandedStepKeys.has(key);
                          return (
                            <div key={key} className="border-b border-border last:border-b-0">
                              <button
                                type="button"
                                onClick={() => toggleStep(run.id, sd.stepIndex)}
                                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left"
                              >
                                <span className="font-mono text-[12.5px] font-semibold text-text">
                                  {sd.promptName}
                                </span>
                                <span className="font-mono text-[10px] text-faint">{sd.promptVersion}</span>
                                <span
                                  className={`ml-auto font-mono text-[9.5px] font-semibold rounded-[5px] px-1.5 py-0.5 ${
                                    sd.reportedStatus === "error"
                                      ? "bg-red-soft text-red"
                                      : "bg-green-soft text-green"
                                  }`}
                                >
                                  {sd.reportedStatus ?? "pending"}
                                </span>
                              </button>
                              {expanded ? (
                                <div className="flex flex-col gap-2.5 px-4 pb-3.5">
                                  {sd.reportedStatus === "error" ? (
                                    <div className="rounded-card bg-red-soft px-3 py-2 text-[11.5px] text-red">
                                      {sd.reportedError ?? "This step was reported as failed."}
                                    </div>
                                  ) : null}
                                  <TemplateBlock label="System message sent" content={sd.systemMessage} />
                                  <TemplateBlock label="User message sent" content={sd.userMessage} />
                                </div>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3.5 flex items-center justify-between gap-4">
                <div className="font-mono text-[11.5px] text-faint">
                  Page <span className="text-text">{chainRunsPage.page}</span> of{" "}
                  <span className="text-text">{Math.max(1, Math.ceil(chainRunsPage.total / chainRunsPage.pageSize))}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={chainRunsPage.page <= 1}
                    onClick={() => onRunsPageChange(chainRunsPage.page - 1)}
                    className="rounded-control border border-border px-2.5 py-1.5 font-mono text-[12px] text-dim disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={chainRunsPage.page * chainRunsPage.pageSize >= chainRunsPage.total}
                    onClick={() => onRunsPageChange(chainRunsPage.page + 1)}
                    className="rounded-control border border-border px-2.5 py-1.5 font-mono text-[12px] text-dim disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )
        ) : null}
      </div>
    </div>
  );
}

function TemplateBlock({ label, content, accent }: { label: string; content: string | null; accent?: boolean }) {
  return (
    <div>
      <div className={`mb-2 font-mono text-[10px] tracking-[0.08em] uppercase ${accent ? "text-a" : "text-faint"}`}>
        {label}
      </div>
      <pre
        className={`m-0 whitespace-pre-wrap rounded-card border p-3.5 font-mono text-[12.5px] leading-relaxed text-text ${
          accent ? "border-a/20 bg-surface" : "border-border bg-surface"
        }`}
      >
        {content ?? "—"}
      </pre>
    </div>
  );
}
