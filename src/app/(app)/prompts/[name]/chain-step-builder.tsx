"use client";

export interface ChainStepDraft {
  /** Auto-assigned by this component in creation order — never user-edited (spec.md Assumptions). */
  id: string;
  promptName: string;
  /** Empty string means "always use the latest version" (blank in the UI). */
  promptVersion: string;
  dependsOn: string[];
}

export interface ChainStepBuilderProps {
  steps: ChainStepDraft[];
  onChange: (steps: ChainStepDraft[]) => void;
  /** The skills the current user can access — restricts the target-skill picker (FR-011). */
  accessibleSkillNames: string[];
}

function nextStepId(steps: ChainStepDraft[]): string {
  return `step-${steps.length + 1}`;
}

/**
 * Pure step-list builder for a chain version's "New version" drawer.
 * Enforces, by construction, that a step may only depend on a strictly
 * earlier step (FR-012) — the picker never offers the step itself or a
 * later step as a dependency, so there is nothing to validate after the
 * fact. A chain reduced to zero steps is still a valid, publishable draft
 * (FR-014).
 */
export function ChainStepBuilder({ steps, onChange, accessibleSkillNames }: ChainStepBuilderProps) {
  function updateStep(index: number, patch: Partial<ChainStepDraft>) {
    const next = steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange(next);
  }

  function addStepAt(index: number) {
    const next = [...steps];
    next.splice(index, 0, { id: nextStepId(steps), promptName: "", promptVersion: "", dependsOn: [] });
    onChange(next);
  }

  function removeStep(index: number) {
    const removedId = steps[index]?.id;
    const next = steps
      .filter((_, i) => i !== index)
      .map((s) => ({ ...s, dependsOn: s.dependsOn.filter((depId) => depId !== removedId) }));
    onChange(next);
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) {
      return;
    }
    const next = [...steps];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  function toggleDepends(index: number, depId: string) {
    const step = steps[index];
    if (!step) {
      return;
    }
    const dependsOn = step.dependsOn.includes(depId)
      ? step.dependsOn.filter((id) => id !== depId)
      : [...step.dependsOn, depId];
    updateStep(index, { dependsOn });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11.5px] leading-relaxed text-dim">
        Each step references another skill by name. Reorder with the arrows; &quot;depends on&quot; marks which
        prior steps feed this one&apos;s input.
      </div>
      {accessibleSkillNames.length === 0 ? (
        <div className="rounded-card border border-border bg-surface py-8 text-center text-[12.5px] text-dim">
          No skills available yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {steps.map((step, i) => (
            <div key={step.id}>
              <div className="flex items-start gap-2.5 rounded-card border border-border bg-surface p-3.5">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-control border border-border-2 bg-surface-2 font-mono text-[11px] text-a">
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <select
                    value={step.promptName}
                    onChange={(e) => updateStep(i, { promptName: e.target.value })}
                    className="w-full rounded-control border border-border-2 bg-bg px-2.5 py-2 font-mono text-[12.5px] text-text outline-none"
                  >
                    <option value="">Select a skill…</option>
                    {accessibleSkillNames.map((skillName) => (
                      <option key={skillName} value={skillName}>
                        {skillName}
                      </option>
                    ))}
                  </select>
                  <input
                    value={step.promptVersion}
                    onChange={(e) => updateStep(i, { promptVersion: e.target.value })}
                    placeholder="version (blank = latest)"
                    className="w-full rounded-control border border-border-2 bg-bg px-2.5 py-1.5 font-mono text-[11.5px] text-text outline-none"
                  />
                  {i > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {steps.slice(0, i).map((prior) => (
                        <button
                          key={prior.id}
                          type="button"
                          onClick={() => toggleDepends(i, prior.id)}
                          className={`rounded-pill border px-2.5 py-0.5 font-mono text-[10.5px] ${
                            step.dependsOn.includes(prior.id)
                              ? "border-a/40 bg-a-soft text-a"
                              : "border-border-2 text-dim"
                          }`}
                        >
                          {prior.id}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => moveStep(i, -1)}
                    className="grid size-6 place-items-center rounded-control border border-border text-dim disabled:opacity-40"
                    aria-label="Move step up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={i === steps.length - 1}
                    onClick={() => moveStep(i, 1)}
                    className="grid size-6 place-items-center rounded-control border border-border text-dim disabled:opacity-40"
                    aria-label="Move step down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    className="grid size-6 place-items-center rounded-control border border-border text-dim"
                    aria-label="Remove step"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="flex justify-center py-1.5">
                <button
                  type="button"
                  onClick={() => addStepAt(i + 1)}
                  className="rounded-pill border border-dashed border-border-2 px-2.5 py-1 font-mono text-[10.5px] text-faint"
                >
                  + Add step
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {steps.length === 0 ? (
        <button
          type="button"
          onClick={() => addStepAt(0)}
          disabled={accessibleSkillNames.length === 0}
          className="self-start rounded-control border border-border-2 bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-dim disabled:opacity-40"
        >
          + Add first step
        </button>
      ) : null}
    </div>
  );
}
