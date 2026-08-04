import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PromptUsageSummaryForOrganization, PromptUsageWindow } from "../domain/prompt-usage";
import { listForOrganizationWindow } from "../infrastructure/prompt-usage-repo";

export interface GetPromptUsageSummaryForOrganizationOptions {
  window: PromptUsageWindow;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile95(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))] ?? null;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getPromptUsageSummaryForOrganization<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
  organizationId: string,
  options: GetPromptUsageSummaryForOrganizationOptions,
): Promise<PromptUsageSummaryForOrganization> {
  const rows = await listForOrganizationWindow(db, organizationId, options.window.from, options.window.to);
  const latencies = rows.flatMap((row) => (row.latencyMs === null ? [] : [row.latencyMs]));
  const successCount = rows.filter((row) => row.statusCode >= 200 && row.statusCode < 400).length;
  const byStatus = new Map<number, number>();
  const bySkill = new Map<
    string,
    {
      promptId: string;
      promptVersionId: string;
      promptVersion: string;
      runCount: number;
      successCount: number;
      failureCount: number;
      latencies: number[];
      lastUsedAt: Date;
    }
  >();
  const byDay = new Map<string, number>();

  for (const row of rows) {
    byStatus.set(row.statusCode, (byStatus.get(row.statusCode) ?? 0) + 1);
    byDay.set(dayKey(row.createdAt), (byDay.get(dayKey(row.createdAt)) ?? 0) + 1);

    const skillKey = `${row.promptId}:${row.promptVersionId}`;
    const existing = bySkill.get(skillKey) ?? {
      promptId: row.promptId,
      promptVersionId: row.promptVersionId,
      promptVersion: row.promptVersion,
      runCount: 0,
      successCount: 0,
      failureCount: 0,
      latencies: [],
      lastUsedAt: row.createdAt,
    };
    existing.runCount += 1;
    if (row.statusCode >= 200 && row.statusCode < 400) {
      existing.successCount += 1;
    } else {
      existing.failureCount += 1;
    }
    if (row.latencyMs !== null) {
      existing.latencies.push(row.latencyMs);
    }
    if (row.createdAt > existing.lastUsedAt) {
      existing.lastUsedAt = row.createdAt;
    }
    bySkill.set(skillKey, existing);
  }

  return {
    window: options.window,
    totalInvocations: rows.length,
    successCount,
    failureCount: rows.length - successCount,
    averageLatencyMs: average(latencies),
    p95LatencyMs: percentile95(latencies),
    byStatus: Array.from(byStatus.entries())
      .map(([statusCode, runCount]) => ({ statusCode, runCount }))
      .sort((a, b) => a.statusCode - b.statusCode),
    bySkill: Array.from(bySkill.values())
      .map((row) => ({
        promptId: row.promptId,
        promptVersionId: row.promptVersionId,
        promptVersion: row.promptVersion,
        runCount: row.runCount,
        successCount: row.successCount,
        failureCount: row.failureCount,
        averageLatencyMs: average(row.latencies),
        lastUsedAt: row.lastUsedAt,
      }))
      .sort((a, b) => b.runCount - a.runCount || a.promptId.localeCompare(b.promptId)),
    dailyCounts: Array.from(byDay.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}
