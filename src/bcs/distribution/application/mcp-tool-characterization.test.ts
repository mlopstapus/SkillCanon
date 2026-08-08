import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MCP_TOOL_NAMES, parseLegacyInput, textResult, toolInputSchemas } from "./mcp-tools";

describe("MCP legacy tool contract", () => {
  it("exposes exactly the six legacy tool names in discovery order", () => {
    expect(MCP_TOOL_NAMES).toEqual([
      "sh-list",
      "sh-search",
      "sh-context",
      "sh-run",
      "sh-workflow-list",
      "sh-workflow-run",
    ]);
  });

  it("preserves required and optional public argument shapes", () => {
    expect(z.object(toolInputSchemas["sh-list"]).parse({})).toEqual({});
    expect(() => z.object(toolInputSchemas["sh-search"]).parse({})).toThrow();
    expect(z.object(toolInputSchemas["sh-search"]).parse({ query: "commit" })).toEqual({ query: "commit" });
    expect(z.object(toolInputSchemas["sh-context"]).parse({})).toEqual({});
    expect(z.object(toolInputSchemas["sh-context"]).parse({ project_id: "p" })).toEqual({ project_id: "p" });
    // sh-run's `input` field was removed entirely (032-skill-file-format-refactor,
    // FR-012/PDR-018) — a skill is invoked, not called with arguments.
    expect(z.object(toolInputSchemas["sh-run"]).parse({ name: "commit" })).toEqual({ name: "commit" });
    expect(() => z.object(toolInputSchemas["sh-workflow-run"]).parse({ name: "flow" })).toThrow();
    expect(z.object(toolInputSchemas["sh-workflow-run"]).parse({ name: "flow", input: "x" })).toEqual({ name: "flow", input: "x" });
  });

  it("parses legacy JSON-object input and wraps all other values as input", () => {
    expect(parseLegacyInput('{"topic":"tests"}')).toEqual({ topic: "tests" });
    expect(parseLegacyInput("plain text")).toEqual({ input: "plain text" });
    expect(parseLegacyInput("[1,2]")).toEqual({ input: "[1,2]" });
  });

  it("returns MCP text content results", () => {
    expect(textResult("hello")).toEqual({ content: [{ type: "text", text: "hello" }] });
  });
});
