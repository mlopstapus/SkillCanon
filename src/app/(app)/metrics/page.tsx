import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPromptUsageSummaryForOrganization, type PromptUsageSummaryForOrganization } from "@/bcs/distribution";
import { authenticateSession } from "@/bcs/identity-access";
import { listSkillsByOrganization } from "@/bcs/prompt-registry";
import { authDb, db, withTenantContext } from "@/shared/db";

interface MetricsPageSkillRow {
  promptId: string;
  name: string;
  promptVersion: string;
  runCount: number;
  successCount: number;
  failureCount: number;
  averageLatencyMs: number | null;
  lastUsedAt: string;
}

interface MetricsPageData {
  totalInvocations: number;
  successCount: number;
  failureCount: number;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  byStatus: Array<{ statusCode: number; runCount: number }>;
  bySkill: MetricsPageSkillRow[];
  dailyCounts: Array<{ day: string; count: number }>;
  windowLabel: string;
}

function formatLatency(value: number | null): string {
  return value === null ? "-" : `${value} ms`;
}

function formatWindow(summary: PromptUsageSummaryForOrganization): string {
  return `${summary.window.from.toISOString().slice(0, 10)} to ${summary.window.to.toISOString().slice(0, 10)}`;
}

function defaultMetricsWindow(now = new Date()): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: now };
}

export function MetricsPageView({ data }: { data: MetricsPageData }) {
  const hasUsage = data.totalInvocations > 0;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[28px] font-bold text-text">Metrics</h1>
        <p className="text-[13px] text-dim">Organization usage for {data.windowLabel}</p>
      </div>

      <div className="grid grid-cols-5 gap-2.5">
        <MetricTile label="Total" value={String(data.totalInvocations)} />
        <MetricTile label="Success" value={String(data.successCount)} />
        <MetricTile label="Failures" value={String(data.failureCount)} />
        <MetricTile label="Avg latency" value={formatLatency(data.averageLatencyMs)} />
        <MetricTile label="P95 latency" value={formatLatency(data.p95LatencyMs)} />
      </div>

      {!hasUsage ? (
        <div className="rounded-card border border-border bg-surface px-5 py-8 text-center text-[13px] text-dim">
          No usage recorded for this organization yet.
        </div>
      ) : null}

      {hasUsage ? (
        <div className="grid grid-cols-[1.4fr_0.8fr] gap-5">
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-[16px] font-semibold">Usage by skill</h2>
            <div className="flex flex-col gap-2.5">
              {data.bySkill.map((skill) => (
                <div key={`${skill.promptId}:${skill.promptVersion}`} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[13px] font-semibold">{skill.name}</div>
                    <div className="font-mono text-[11px] text-faint">v{skill.promptVersion} last used {skill.lastUsedAt}</div>
                  </div>
                  <span className="font-mono text-[11.5px] text-dim">{skill.runCount} runs</span>
                  <span className="font-mono text-[11.5px] text-green">{skill.successCount} ok</span>
                  <span className="font-mono text-[11.5px] text-red">{skill.failureCount} failed</span>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-[16px] font-semibold">Status codes</h2>
            <div className="flex flex-col gap-2.5">
              {data.byStatus.map((status) => (
                <div key={status.statusCode} className="flex items-center justify-between rounded-card border border-border bg-surface px-3.5 py-3">
                  <span className="font-mono text-[13px]">{status.statusCode}</span>
                  <span className="font-mono text-[11.5px] text-dim">{status.runCount} runs</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3.5">
      <div className="mb-2 font-mono text-[10px] tracking-[0.08em] text-faint uppercase">{label}</div>
      <div className="font-display text-[22px] font-bold">{value}</div>
    </div>
  );
}

export default async function MetricsPage() {
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);
  if (!user) {
    redirect("/login");
  }

  const summary = await withTenantContext(db, user.orgId, (tx) =>
    getPromptUsageSummaryForOrganization(tx, user.orgId, {
      window: defaultMetricsWindow(),
    }),
  );
  const skills = await withTenantContext(db, user.orgId, (tx) => listSkillsByOrganization(tx, user.orgId));
  const skillNameById = new Map(skills.map((skill) => [skill.id, skill.name]));

  return (
    <MetricsPageView
      data={{
        totalInvocations: summary.totalInvocations,
        successCount: summary.successCount,
        failureCount: summary.failureCount,
        averageLatencyMs: summary.averageLatencyMs,
        p95LatencyMs: summary.p95LatencyMs,
        byStatus: summary.byStatus,
        dailyCounts: summary.dailyCounts,
        windowLabel: formatWindow(summary),
        bySkill: summary.bySkill.map((skill) => ({
          promptId: skill.promptId,
          name: skillNameById.get(skill.promptId) ?? skill.promptId,
          promptVersion: skill.promptVersion,
          runCount: skill.runCount,
          successCount: skill.successCount,
          failureCount: skill.failureCount,
          averageLatencyMs: skill.averageLatencyMs,
          lastUsedAt: skill.lastUsedAt.toISOString().slice(0, 10),
        })),
      }}
    />
  );
}
