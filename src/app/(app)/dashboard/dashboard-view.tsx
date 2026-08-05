import Link from "next/link";
import { AppState } from "@/shared/ui";

export interface DashboardRecentPrompt {
  name: string;
  description: string | null;
  updatedAt: string;
}

export interface DashboardData {
  orgName: string;
  teamCount: number;
  memberCount: number;
  projectCount: number;
  promptCount: number;
  usage: { totalInvocations: number; successCount: number; failureCount: number; windowLabel: string };
  recentPrompts: DashboardRecentPrompt[];
}

function SnapshotTile({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="rounded-card border border-border bg-surface px-4 py-3.5 transition hover:border-border-2">
      <div className="mb-2 font-mono text-[10px] tracking-[0.08em] text-faint uppercase">{label}</div>
      <div className="font-display text-[22px] font-bold">{value}</div>
    </Link>
  );
}

export function DashboardView({ data }: { data: DashboardData }) {
  const hasPrompts = data.recentPrompts.length > 0;

  return (
    <main className="p-8" aria-labelledby="overview-title">
      <p className="font-mono text-[11px] tracking-[0.12em] text-a uppercase">Workspace</p>
      <h1 id="overview-title" className="mt-2 font-display text-[30px] font-semibold tracking-[-0.025em]">
        Overview
      </h1>
      <p className="mt-1.5 text-[13px] text-dim">{data.orgName}</p>

      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SnapshotTile label="Teams" value={String(data.teamCount)} href="/teams" />
        <SnapshotTile label="Members" value={String(data.memberCount)} href="/teams" />
        <SnapshotTile label="Projects" value={String(data.projectCount)} href="/projects" />
        <SnapshotTile label="Prompts" value={String(data.promptCount)} href="/prompts" />
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[16px] font-semibold">Usage — {data.usage.windowLabel}</h2>
          <Link href="/metrics" className="text-[12.5px] font-medium text-a">
            View metrics &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <SnapshotTile label="Invocations" value={String(data.usage.totalInvocations)} href="/metrics" />
          <SnapshotTile label="Success" value={String(data.usage.successCount)} href="/metrics" />
          <SnapshotTile label="Failures" value={String(data.usage.failureCount)} href="/metrics" />
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[16px] font-semibold">Recent prompts</h2>
          <Link href="/prompts" className="text-[12.5px] font-medium text-a">
            View all &rarr;
          </Link>
        </div>
        {hasPrompts ? (
          <div className="flex flex-col gap-2">
            {data.recentPrompts.map((prompt) => (
              <Link
                key={prompt.name}
                href={`/prompts/${prompt.name}`}
                className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-3 transition hover:border-border-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[13px] font-semibold">{prompt.name}</div>
                  {prompt.description ? (
                    <div className="mt-0.5 truncate text-[12px] text-faint">{prompt.description}</div>
                  ) : null}
                </div>
                <span className="flex-none font-mono text-[11px] text-faint">{prompt.updatedAt}</span>
              </Link>
            ))}
          </div>
        ) : (
          <AppState
            variant="empty"
            title="No prompts yet"
            description="Create your first reusable prompt to see recent activity here."
            action={
              <Link href="/prompts" className="rounded-cta bg-a px-3.5 py-2 text-[13px] font-semibold text-a-fg">
                Go to Prompts
              </Link>
            }
          />
        )}
      </div>
    </main>
  );
}
