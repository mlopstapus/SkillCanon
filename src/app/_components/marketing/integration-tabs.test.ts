import { describe, expect, it } from "vitest";
import { CODE_SAMPLE_TABS, DEFAULT_CODE_SAMPLE } from "./integration-tabs";

describe("integration tabs state", () => {
  it("defaults to the cli sample", () => {
    expect(DEFAULT_CODE_SAMPLE).toBe("cli");
  });

  it("lists all three tabs in source-design order", () => {
    expect(CODE_SAMPLE_TABS.map((tab) => tab.key)).toEqual(["cli", "skillFile", "curl"]);
    expect(CODE_SAMPLE_TABS.map((tab) => tab.label)).toEqual(["cli", "skill.md", "curl"]);
  });
});
