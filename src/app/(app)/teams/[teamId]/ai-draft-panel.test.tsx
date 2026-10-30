import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiDraftPanelView } from "./ai-draft-panel";

const noop = () => {};

describe("AiDraftPanelView", () => {
  it("renders the conversation, drafts with a review button, and the input", () => {
    const html = renderToStaticMarkup(
      <AiDraftPanelView
        messages={[
          { role: "user", content: "We are regulated." },
          { role: "assistant", content: "Here are two drafts." },
        ]}
        drafts={[
          { kind: "policy", name: "audit-trail", enforcementType: "append", content: "Log every change." },
          { kind: "objective", title: "Pass the audit", description: "By Q3." },
        ]}
        input=""
        pending={false}
        error={null}
        onInputChange={noop}
        onSend={noop}
        onUseDraft={noop}
      />,
    );
    expect(html).toContain("We are regulated.");
    expect(html).toContain("Policy: audit-trail");
    expect(html).toContain("Objective: Pass the audit");
    expect(html).toContain("Review &amp; create");
    expect(html).toContain('aria-label="Message the AI assistant"');
  });

  it("shows an error and disables Send while empty", () => {
    const html = renderToStaticMarkup(
      <AiDraftPanelView
        messages={[]}
        drafts={[]}
        input=""
        pending={false}
        error="AI features are off for this organization."
        onInputChange={noop}
        onSend={noop}
        onUseDraft={noop}
      />,
    );
    expect(html).toContain("AI features are off");
    expect(html).toContain("disabled");
  });
});
