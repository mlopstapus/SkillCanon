import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AuditActorOption } from "@/bcs/audit-compliance";
import { FilterBar } from "./filter-bar";

const noop = () => {};

const actorOptions: AuditActorOption[] = [
  { actorUserId: "user-1", actorApiKeyId: null, displayName: "Alice", subtitle: "admin" },
  { actorUserId: null, actorApiKeyId: null, displayName: "system", subtitle: "scheduled" },
];

describe("FilterBar", () => {
  it("renders the resource, actor, and transport options, including a Transport dropdown added beyond the mockup", () => {
    const markup = renderToStaticMarkup(
      <FilterBar
        filters={{}}
        resourceOptions={["policy", "team"]}
        actorOptions={actorOptions}
        onChange={noop}
        onClear={noop}
      />,
    );

    expect(markup).toContain("policy");
    expect(markup).toContain("team");
    expect(markup).toContain("Alice");
    expect(markup).toContain("system");
    expect(markup).toContain("Transport");
    expect(markup).toContain("web");
    expect(markup).toContain("cli");
  });

  it("does not render the Clear action when no filter is active", () => {
    const markup = renderToStaticMarkup(
      <FilterBar filters={{}} resourceOptions={[]} actorOptions={[]} onChange={noop} onClear={noop} />,
    );

    expect(markup).not.toContain(">Clear<");
  });

  it("renders the Clear action once a filter is active", () => {
    const markup = renderToStaticMarkup(
      <FilterBar
        filters={{ q: "policy" }}
        resourceOptions={[]}
        actorOptions={[]}
        onChange={noop}
        onClear={noop}
      />,
    );

    expect(markup).toContain(">Clear<");
  });

  it("shows the custom start/end date inputs only when range is 'custom'", () => {
    const withoutCustom = renderToStaticMarkup(
      <FilterBar
        filters={{ range: "7d" }}
        resourceOptions={[]}
        actorOptions={[]}
        onChange={noop}
        onClear={noop}
      />,
    );
    const withCustom = renderToStaticMarkup(
      <FilterBar
        filters={{ range: "custom" }}
        resourceOptions={[]}
        actorOptions={[]}
        onChange={noop}
        onClear={noop}
      />,
    );

    expect(withoutCustom).not.toContain('type="date"');
    expect(withCustom).toContain('type="date"');
  });
});
