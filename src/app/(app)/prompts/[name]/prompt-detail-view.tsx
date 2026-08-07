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
  /** The step's resolved expansion content (032-skill-file-format-refactor) — replaces systemMessage/userMessage. */
  content: string;
  reportedStatus: "success" | "error" | null;
  reportedError: string | null;
}

/** A named file (main or supporting) belonging to a new-shape template-kind version (032-skill-file-format-refactor). */
export interface PromptDetailFileView {
  id: string;
  name: string;
  content: string;
  isMain: boolean;
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
    stepCount: number;
    /** Main file content (new-shape) or legacy system/user content, for the version-history drawer's short preview. `null` for a chain-kind version. */
    contentPreview: string | null;
  }>;
  /** Of the currently-active version. Drives which section set renders (FR-001). */
  kind: "template" | "chain";
  /** False when the skill has never had a version published (createPrompt-only state). */
  hasActiveVersion: boolean;
  /**
   * True for a template-kind active version published before
   * 032-skill-file-format-refactor shipped (no `files` at all) — the Files
   * tab is not offered for it; Overview shows its legacy content inline
   * instead (FR-019).
   */
  isLegacyShape: boolean;
  /** New-shape (`kind === "template" && !isLegacyShape`) file bundle: required main file (`SKILL.md`) plus zero or more supporting files. */
  files: PromptDetailFileView[];
  legacySystemTemplate: string | null;
  legacyUserTemplate: string | null;
  /** Resolved content (governance-applied) for the active template-kind version, or `null` if resolution failed. */
  preview: string | null;
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

export type PromptDetailTab = "overview" | "files" | "preview" | "policies" | "steps" | "runs";

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
  const mainFile = data.files.find((f) => f.isMain) ?? null;
  const supportingFiles = data.files.filter((f) => !f.isMain);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(mainFile?.id ?? null);
  const [fileView, setFileView] = useState<"preview" | "plain">("preview");
  const selectedFile = data.files.find((f) => f.id === selectedFileId) ?? mainFile;
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

  const tabs: Array<[PromptDetailTab, string]> =
    data.kind === "chain"
      ? [
          ["steps", `Steps (${data.steps?.length ?? 0})`],
          ["runs", "Run history"],
        ]
      : data.isLegacyShape
        ? [
            ["overview", "Overview"],
            ["preview", "Preview"],
            ["policies", `Applied policies (${data.appliedPolicies.length})`],
          ]
        : [
            ["overview", "Overview"],
            ["files", `Files (${data.files.length})`],
            ["preview", "Preview"],
            ["policies", `Applied policies (${data.appliedPolicies.length})`],
          ];

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
          {tabs.map(([key, label]) => (
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
        {activeTab === "overview" ? (
          !data.hasActiveVersion ? (
            <div role="status" className="py-10 text-center text-[12.5px] text-dim">
              No version published yet. Click <span className="text-text">+ New version</span> to author this
              skill&apos;s instructions.
            </div>
          ) : data.isLegacyShape ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-card border border-border-2 bg-surface p-3.5 text-[11.5px] leading-relaxed text-dim">
                This version predates file-based skills — its instructions are a single system/user template
                pair, shown read-only below. Publish a new version to move it to the current file-based format.
              </div>
              <TextBlock label="System template" content={data.legacySystemTemplate} />
              <TextBlock label="User template" content={data.legacyUserTemplate} />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryCard label="Active version" value={data.activeVersion ?? "—"} />
                <SummaryCard label="Files" value={String(data.files.length)} />
                <SummaryCard label="Applied policies" value={String(data.appliedPolicies.length)} />
                <SummaryCard label="Owner" value={data.ownerLabel} />
              </div>
              <div>
                <div className="mb-2 font-mono text-[10px] tracking-[0.08em] text-faint uppercase">
                  Files in this version
                </div>
                <div className="flex flex-col gap-2">
                  {data.files.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setSelectedFileId(f.id);
                        onTabChange("files");
                      }}
                      className="flex items-center gap-2.5 rounded-control border border-border bg-surface px-3.5 py-2.5 text-left"
                    >
                      <span className="font-mono text-[12.5px] text-text">{f.name}</span>
                      {f.isMain ? (
                        <span className="rounded-[5px] bg-a-soft px-1.5 py-0.5 font-mono text-[9.5px] text-a">
                          required
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        ) : null}

        {activeTab === "files" ? (
          <div className="flex min-h-[420px] overflow-hidden rounded-card border border-border">
            <div className="flex w-[220px] shrink-0 flex-col gap-4 border-r border-border bg-surface p-3.5">
              <div>
                <div className="mb-1.5 px-1 font-mono text-[9.5px] tracking-[0.1em] text-faint uppercase">
                  Main file
                </div>
                {mainFile ? (
                  <button
                    type="button"
                    onClick={() => setSelectedFileId(mainFile.id)}
                    className={`flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left font-mono text-[12px] ${
                      selectedFile?.id === mainFile.id ? "bg-a-soft text-text" : "text-text"
                    }`}
                  >
                    {mainFile.name}
                  </button>
                ) : null}
              </div>
              <div>
                <div className="mb-1.5 px-1 font-mono text-[9.5px] tracking-[0.1em] text-faint uppercase">
                  Supporting ({supportingFiles.length})
                </div>
                {supportingFiles.length === 0 ? (
                  <div className="px-1 text-[11px] text-faint">No supporting files.</div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {supportingFiles.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setSelectedFileId(f.id)}
                        className={`w-full truncate rounded-control px-2.5 py-1.5 text-left font-mono text-[12px] ${
                          selectedFile?.id === f.id ? "bg-a-soft text-text" : "text-text"
                        }`}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-border bg-bg px-4 py-2.5">
                <span className="font-mono text-[12.5px] text-dim">{selectedFile?.name}</span>
                <div className="flex gap-0.5 rounded-control border border-border-2 bg-surface p-0.5">
                  <button
                    type="button"
                    onClick={() => setFileView("preview")}
                    className={`rounded-[6px] px-2.5 py-1 font-mono text-[11px] ${
                      fileView === "preview" ? "bg-a-soft text-a" : "text-dim"
                    }`}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setFileView("plain")}
                    className={`rounded-[6px] px-2.5 py-1 font-mono text-[11px] ${
                      fileView === "plain" ? "bg-a-soft text-a" : "text-dim"
                    }`}
                  >
                    Plain text
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4.5">
                {fileView === "plain" || !selectedFile ? (
                  <pre className="m-0 whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-text">
                    {selectedFile?.content ?? "—"}
                  </pre>
                ) : (
                  <MarkdownPreview content={selectedFile.content} />
                )}
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "preview" ? (
          data.previewError ? (
            <div className="rounded-card border border-red/30 bg-red-soft p-4 text-[12.5px] text-red">
              {data.previewError}
            </div>
          ) : (
            <TextBlock label="Resolved content" content={data.preview} accent />
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
                                  <TextBlock label="Content sent" content={sd.content} />
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3.5">
      <div className="mb-1.5 font-mono text-[9.5px] tracking-[0.1em] text-faint uppercase">{label}</div>
      <div className="font-display text-[18px] font-bold">{value}</div>
    </div>
  );
}

function TextBlock({ label, content, accent }: { label: string; content: string | null; accent?: boolean }) {
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

/** Minimal Markdown block renderer for the Files tab's Preview toggle (headings, list items, paragraphs, blank lines). */
function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="flex max-w-[680px] flex-col gap-0.5">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) {
          return (
            <div key={i} className="mt-2.5 mb-1 font-display text-[13.5px] font-semibold">
              {line.slice(4)}
            </div>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <div key={i} className="mt-3.5 mb-1.5 font-display text-[16px] font-bold">
              {line.slice(3)}
            </div>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <div key={i} className="mt-1.5 mb-2 font-display text-[22px] font-bold tracking-tight">
              {line.slice(2)}
            </div>
          );
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={i} className="flex gap-2 pl-1 text-[13px] leading-relaxed text-text">
              <span className="text-faint">•</span>
              {line.slice(2)}
            </div>
          );
        }
        if (line.trim() === "") {
          return <div key={i} className="h-1.5" />;
        }
        return (
          <div key={i} className="text-[13px] leading-relaxed text-text">
            {line}
          </div>
        );
      })}
    </div>
  );
}
