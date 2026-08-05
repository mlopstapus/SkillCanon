import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expectNoCriticalOrSeriousAxeViolations } from "@/shared/testing/accessibility";
import { TerminalState, type TerminalStateTone } from "./terminal-state";

const tones: Array<{ tone: TerminalStateTone; role: string }> = [
  { tone: "danger", role: "alert" },
  { tone: "neutral", role: "status" },
  { tone: "success", role: "status" },
  { tone: "accent", role: "status" },
];

describe("TerminalState", () => {
  it.each(tones)("uses role=$role for tone=$tone, with a polite live region", async ({ tone, role }) => {
    const html = renderToStaticMarkup(
      <TerminalState heading="This link has expired" message="Ask your admin to send a new invitation." buttonLabel="Back to login" href="/login" tone={tone} />,
    );

    expect(html).toContain(`role="${role}"`);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("This link has expired");
    await expectNoCriticalOrSeriousAxeViolations(html);
  });

  it("keeps the tone icon decorative", () => {
    const html = renderToStaticMarkup(
      <TerminalState heading="Invitation revoked" message="This invitation is no longer valid." buttonLabel="Back to login" href="/login" tone="danger" />,
    );

    expect(html).toContain('aria-hidden="true"');
  });

  it("renders the recovery action as a real link", () => {
    const html = renderToStaticMarkup(
      <TerminalState heading="Already set up" message="This instance already has an admin account." buttonLabel="Go to login" href="/login" tone="neutral" />,
    );

    expect(html).toContain('href="/login"');
    expect(html).toContain("Go to login");
  });
});
