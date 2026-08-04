import Link from "next/link";
import { AppState } from "@/shared/ui";

export interface ProjectListRow {
  id: string;
  name: string;
  description: string;
  teamLabel: string;
  leadLabel: string | null;
  memberCount: number;
  promptCount: number;
}

export interface ProjectsListViewProps {
  rows: ProjectListRow[];
  onNewProject: () => void;
}

export function ProjectsListView({ rows, onNewProject }: ProjectsListViewProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-bg px-6.5 pt-4 pb-4">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="mb-2 font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
              Prompt registry
            </div>
            <h1 className="font-display text-[22px] font-bold tracking-tight">Projects</h1>
            <p className="mt-1.5 max-w-[560px] text-[12.5px] leading-relaxed text-dim">
              Team-owned workspaces that group prompts and cross-team members.
            </p>
          </div>
          <button
            type="button"
            onClick={onNewProject}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control bg-a px-4 py-2.5 text-[13px] font-semibold text-a-fg shadow-glow"
          >
            + New project
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6.5 py-5">
        <div className="flex max-w-[920px] flex-col gap-2.5">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/projects/${row.id}`}
              className="flex items-center gap-3.5 rounded-card border border-border bg-surface px-4.5 py-3.5 hover:border-border-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold">{row.name}</span>
                  <span className="rounded-pill border border-border-2 px-2 py-0.5 font-mono text-[10.5px] text-dim">
                    {row.teamLabel}
                  </span>
                </div>
                <div className="mt-1 truncate text-[12px] text-dim">{row.description}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2 font-mono text-[10.5px] text-dim">
                {row.leadLabel ? <span>lead {row.leadLabel}</span> : null}
                <span className="rounded-[6px] border border-border bg-surface-2 px-2 py-0.5">
                  {row.memberCount} members
                </span>
                <span className="rounded-[6px] border border-border bg-surface-2 px-2 py-0.5">
                  {row.promptCount} prompts
                </span>
              </div>
            </Link>
          ))}
          {rows.length === 0 ? (
            <AppState
              variant="empty"
              title="No projects yet"
              description="Create a project to group prompts, repos, collaborators, and usage history under one team-owned workspace."
              action={
                <button
                  type="button"
                  onClick={onNewProject}
                  className="rounded-control border border-border-2 bg-surface px-4 py-2 text-[12.5px] font-semibold"
                >
                  New project
                </button>
              }
              className="max-w-[520px] py-16"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
