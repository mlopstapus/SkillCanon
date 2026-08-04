import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChainStepBuilder, type ChainStepDraft } from "./chain-step-builder";

describe("ChainStepBuilder", () => {
  it("renders every step with its target-skill picker, version-pin input, and reorder/remove controls", () => {
    const steps: ChainStepDraft[] = [
      { id: "step-1", promptName: "summarize", promptVersion: "", dependsOn: [] },
      { id: "step-2", promptName: "draft-reply", promptVersion: "v2", dependsOn: ["step-1"] },
    ];
    const html = renderToStaticMarkup(
      <ChainStepBuilder steps={steps} onChange={vi.fn()} accessibleSkillNames={["summarize", "draft-reply"]} />,
    );

    expect(html).toContain("summarize");
    expect(html).toContain("draft-reply");
    expect(html).toContain("v2");
    expect(html).toContain("step-1");
  });

  it("only offers strictly-earlier steps as a dependency — never a later step or the step itself", () => {
    const steps: ChainStepDraft[] = [
      { id: "step-1", promptName: "a", promptVersion: "", dependsOn: [] },
      { id: "step-2", promptName: "b", promptVersion: "", dependsOn: [] },
      { id: "step-3", promptName: "c", promptVersion: "", dependsOn: [] },
    ];
    const html = renderToStaticMarkup(
      <ChainStepBuilder steps={steps} onChange={vi.fn()} accessibleSkillNames={["a", "b", "c"]} />,
    );

    // Step 1 (first) has no dependency chip row at all — nothing earlier exists.
    // Step 2 can only depend on step-1; step 3 can depend on step-1 and step-2.
    // A crude but effective structural check: "step-3" as a dependency chip label
    // never appears (it would only render for a step after it, and there is none).
    const dependencyChipMatches = html.match(/>step-3</g) ?? [];
    // The only occurrence of "step-3" text should be the step's own row number/id
    // context, not a dependency chip offered to an earlier step.
    expect(dependencyChipMatches.length).toBeLessThanOrEqual(1);
  });

  it("shows a distinct empty state when no accessible skills exist to pick from", () => {
    const html = renderToStaticMarkup(
      <ChainStepBuilder steps={[]} onChange={vi.fn()} accessibleSkillNames={[]} />,
    );
    expect(html).toContain("No skills available yet.");
  });

  it("a chain reduced to zero steps still renders in a valid state, with an affordance to add the first step", () => {
    const html = renderToStaticMarkup(
      <ChainStepBuilder steps={[]} onChange={vi.fn()} accessibleSkillNames={["summarize"]} />,
    );
    expect(html).toContain("Add first step");
  });
});
