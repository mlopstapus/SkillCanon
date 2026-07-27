/**
 * Characterization test: verifies that no application-layer function can
 * update an existing PromptVersion record. This is the immutability guarantee
 * required by the expansion engine (FR-011, SC-003).
 *
 * This test does NOT connect to a database; it inspects module exports at the
 * module level.
 */
import { describe, expect, it } from "vitest";
import * as promptVersionsRepo from "../infrastructure/prompt-versions-repo";
import * as publishVersionModule from "./publish-version";
import * as listVersionsModule from "./list-versions";

describe("PromptVersion immutability characterization", () => {
  it("prompt-versions-repo exports no update function", () => {
    const exports = Object.keys(promptVersionsRepo);
    const updateExports = exports.filter(
      (key) => key.toLowerCase().includes("update") || key.toLowerCase().includes("edit") || key.toLowerCase().includes("patch"),
    );
    expect(updateExports).toHaveLength(0);
  });

  it("publish-version module exports no updateVersion or updatePromptVersion", () => {
    const exports = Object.keys(publishVersionModule);
    const updateExports = exports.filter(
      (key) =>
        key.toLowerCase().includes("updateversion") ||
        key.toLowerCase().includes("updatepromptversion"),
    );
    expect(updateExports).toHaveLength(0);
  });

  it("list-versions module exports no updateVersion or updatePromptVersion", () => {
    const exports = Object.keys(listVersionsModule);
    const updateExports = exports.filter(
      (key) =>
        key.toLowerCase().includes("updateversion") ||
        key.toLowerCase().includes("updatepromptversion"),
    );
    expect(updateExports).toHaveLength(0);
  });
});
