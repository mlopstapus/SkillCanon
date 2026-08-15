import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { expectNoCriticalOrSeriousAxeViolations } from "@/shared/testing/accessibility";
import { CopySkillDrawer } from "./copy-skill-drawer";

const baseProps = {
  sourceName: "commit-message",
  sourceDescription: "Generates a commit message.",
  onClose: vi.fn(),
  onSubmit: vi.fn().mockResolvedValue({ ok: true }),
};

describe("CopySkillDrawer", () => {
  it("prefills name and description from the source skill", () => {
    const html = renderToStaticMarkup(<CopySkillDrawer {...baseProps} />);

    expect(html).toContain("Copy skill");
    expect(html).toContain("commit-message-copy");
    expect(html).toContain("Generates a commit message.");
  });

  it("has no critical or serious axe violations (Constitution Principle VIII)", async () => {
    const html = renderToStaticMarkup(<CopySkillDrawer {...baseProps} />);
    await expectNoCriticalOrSeriousAxeViolations(html);
  });
});
