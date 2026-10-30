import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ObjectiveSummaryView } from "./objective-summary";

const noop = () => {};

describe("ObjectiveSummaryView", () => {
  it("renders the buttons, a summary and its note", () => {
    const html = renderToStaticMarkup(
      <ObjectiveSummaryView summary="Cost and speed." note="2 objectives" error={null} pending={false} onSummarizeTeam={noop} onSummarizeOrg={noop} />,
    );
    expect(html).toContain("Summarize this team");
    expect(html).toContain("Summarize organization");
    expect(html).toContain("Cost and speed.");
    expect(html).toContain("2 objectives");
  });

  it("renders an error", () => {
    const html = renderToStaticMarkup(
      <ObjectiveSummaryView summary={null} note={null} error="AI features are off." pending={false} onSummarizeTeam={noop} onSummarizeOrg={noop} />,
    );
    expect(html).toContain("AI features are off.");
  });
});
