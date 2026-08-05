import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expectNoCriticalOrSeriousAxeViolations } from "@/shared/testing/accessibility";
import { AppState, type AppStateVariant } from "./app-state";

const variants: Array<{ variant: AppStateVariant; role: string; title: string }> = [
  { variant: "empty", role: "status", title: "No projects yet" },
  { variant: "loading", role: "status", title: "Loading projects" },
  { variant: "error", role: "alert", title: "Projects could not load" },
];

describe("AppState", () => {
  it.each(variants)("renders the $variant variant with the canonical role and live region", ({ variant, role, title }) => {
    const html = renderToStaticMarkup(
      <AppState variant={variant} title={title} description="Check the current filters and try again." />,
    );

    expect(html).toContain(`role="${role}"`);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(title);
  });

  it("keeps the loading spinner decorative", () => {
    const html = renderToStaticMarkup(
      <AppState variant="loading" title="Loading prompts" description="The registry is refreshing." />,
    );

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("animate-spin-sc");
  });

  it("places the optional action after the description", () => {
    const html = renderToStaticMarkup(
      <AppState
        variant="empty"
        title="No prompts yet"
        description="Create the first reusable prompt."
        action={<button type="button">New prompt</button>}
      />,
    );

    expect(html.indexOf("Create the first reusable prompt.")).toBeLessThan(html.indexOf("New prompt"));
  });

  it("has no critical or serious automated accessibility violations", async () => {
    const html = renderToStaticMarkup(
      <AppState
        variant="error"
        title="Audit log unavailable"
        description="The audit trail could not be loaded."
        action={<button type="button">Retry</button>}
      />,
    );

    await expectNoCriticalOrSeriousAxeViolations(html);
  });
});
