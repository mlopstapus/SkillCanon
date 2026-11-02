import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GatePanel, type GateTabData } from "./gate-panel";

const gate: GateTabData = { canManage: true, enabled: true, models: ["a/m1"], minPassPct: 100, candidates: ["1.1.0"] };
const props = { poolModels: ["a/m1", "a/m2"], onSetGate: vi.fn(), onActivate: vi.fn() };

describe("GatePanel", () => {
  it("shows the candidate and manage controls to an owner or admin", () => {
    const html = renderToStaticMarkup(<GatePanel gate={gate} {...props} />);
    expect(html).toContain("1.1.0");
    expect(html).toContain("Activate anyway");
    expect(html).toContain("Turn gate off");
  });

  it("is read-only for anyone else", () => {
    const html = renderToStaticMarkup(<GatePanel gate={{ ...gate, canManage: false }} {...props} />);
    expect(html).toContain("candidate");
    expect(html).not.toContain("Activate anyway");
    expect(html).not.toContain("Turn gate off");
  });

  it("offers to turn the gate on when it is off", () => {
    const html = renderToStaticMarkup(<GatePanel gate={{ ...gate, enabled: false, candidates: [] }} {...props} />);
    expect(html).toContain("Turn gate on");
  });
});
