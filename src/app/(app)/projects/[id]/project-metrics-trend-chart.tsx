"use client";

const SEGMENT_COLORS = ["bg-a", "bg-blue", "bg-violet", "bg-green", "bg-red"];

export interface ProjectMetricsTrendDay {
  day: string;
  countsByPromptId: Record<string, number>;
}

export interface ProjectMetricsTrendSkill {
  id: string;
  name: string;
}

export interface ProjectMetricsTrendChartProps {
  trend: ProjectMetricsTrendDay[];
  skills: ProjectMetricsTrendSkill[];
}

/**
 * Pure presentational 14-day stacked-bar trend, one segment per skill
 * (024-project-usage-metrics-dashboard, spec FR-007). Colors are assigned
 * deterministically by skill index rather than passed in by the caller,
 * per plan.md's Structure Decision.
 */
export function ProjectMetricsTrendChart({ trend, skills }: ProjectMetricsTrendChartProps) {
  const colorBySkillId = new Map(skills.map((s, i) => [s.id, SEGMENT_COLORS[i % SEGMENT_COLORS.length]]));
  const maxDayTotal = Math.max(
    1,
    ...trend.map((day) => Object.values(day.countsByPromptId).reduce((sum, n) => sum + n, 0)),
  );

  return (
    <div className="flex h-20 items-end gap-1 rounded-card border border-border px-3.5 py-3">
      {trend.map((day) => {
        const dayTotal = Object.values(day.countsByPromptId).reduce((sum, n) => sum + n, 0);
        return (
          <div key={day.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className="flex w-full max-w-[18px] flex-col-reverse overflow-hidden rounded-t-[3px]" style={{ height: `${Math.round((dayTotal / maxDayTotal) * 100)}%`, minHeight: dayTotal > 0 ? "2px" : "0px" }}>
              {Object.entries(day.countsByPromptId).map(([promptId, count]) => (
                <div
                  key={promptId}
                  className={colorBySkillId.get(promptId) ?? "bg-a"}
                  style={{ height: `${(count / dayTotal) * 100}%` }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
