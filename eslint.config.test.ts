import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

async function withFixtureFile(
  targetPath: string,
  run: () => Promise<void>,
): Promise<void> {
  const absolute = path.join(process.cwd(), targetPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, "export const fixtureTarget = 1;\n");
  try {
    await run();
  } finally {
    await rm(absolute, { force: true });
  }
}

async function lintBoundaries(code: string, filePath: string) {
  const results = await eslint.lintText(code, { filePath });
  const [result] = results;
  if (!result) {
    throw new Error("ESLint.lintText() returned no results");
  }
  return result.messages.filter((m) => m.ruleId === "boundaries/dependencies");
}

function expectSingleBoundaryError(messages: Awaited<ReturnType<typeof lintBoundaries>>) {
  expect(messages).toHaveLength(1);
  const [violation] = messages;
  if (!violation) {
    throw new Error("expected exactly one boundaries/dependencies message");
  }
  expect(violation.severity).toBe(2); // error, not warning (FR-005)
  return violation;
}

describe("module boundary lint enforcement", () => {
  it("denies a cross-context import that bypasses the target's barrel (FR-001)", async () => {
    await withFixtureFile("src/bcs/identity-access/domain/__fixture_target.ts", async () => {
      const messages = await lintBoundaries(
        'import { fixtureTarget } from "../../identity-access/domain/__fixture_target";\n',
        "src/bcs/governance/application/__fixture_importer.ts",
      );
      expectSingleBoundaryError(messages);
    });
  }, 15_000);

  it("names the violated context's CONTRACT.md in the error message (FR-006)", async () => {
    await withFixtureFile("src/bcs/identity-access/domain/__fixture_target.ts", async () => {
      const messages = await lintBoundaries(
        'import { fixtureTarget } from "../../identity-access/domain/__fixture_target";\n',
        "src/bcs/governance/application/__fixture_importer.ts",
      );
      const violation = expectSingleBoundaryError(messages);
      expect(violation.message).toContain("bcs/identity-access/CONTRACT.md");
    });
  });

  it("applies to test files with no exemption (FR-009)", async () => {
    await withFixtureFile("src/bcs/identity-access/domain/__fixture_target.ts", async () => {
      const messages = await lintBoundaries(
        'import { fixtureTarget } from "../../identity-access/domain/__fixture_target";\n',
        "src/bcs/governance/application/__fixture_importer.test.ts",
      );
      expectSingleBoundaryError(messages);
    });
  });

  it("applies to type-only imports with no exemption (FR-010)", async () => {
    await withFixtureFile("src/bcs/identity-access/domain/__fixture_target.ts", async () => {
      const messages = await lintBoundaries(
        'import type { FixtureTarget } from "../../identity-access/domain/__fixture_target";\n',
        "src/bcs/governance/application/__fixture_importer.ts",
      );
      expectSingleBoundaryError(messages);
    });
  });

  it("denies a direct import of another context's schema/model file (FR-002)", async () => {
    await withFixtureFile("src/bcs/identity-access/schema.ts", async () => {
      const messages = await lintBoundaries(
        'import { fixtureTarget } from "../../identity-access/schema";\n',
        "src/bcs/governance/application/__fixture_importer.ts",
      );
      expectSingleBoundaryError(messages);
    });
  });

  it("denies code outside src/bcs/* (e.g. src/app/) reaching into a BC's internals", async () => {
    await withFixtureFile("src/bcs/governance/domain/__fixture_target.ts", async () => {
      const messages = await lintBoundaries(
        'import { fixtureTarget } from "../bcs/governance/domain/__fixture_target";\n',
        "src/app/__fixture_route.ts",
      );
      expectSingleBoundaryError(messages);
    });
  });

  it("denies violations for a second, different bounded-context pair (SC-001)", async () => {
    await withFixtureFile(
      "src/bcs/billing-entitlements/domain/__fixture_target.ts",
      async () => {
        const messages = await lintBoundaries(
          'import { fixtureTarget } from "../../billing-entitlements/domain/__fixture_target";\n',
          "src/bcs/prompt-registry/application/__fixture_importer.ts",
        );
        expectSingleBoundaryError(messages);
      },
    );
  });

  it("allows importing another context through its barrel (FR-001, User Story 2)", async () => {
    const messages = await lintBoundaries(
      'import "../../identity-access";\n',
      "src/bcs/governance/application/__fixture_importer.ts",
    );
    expect(messages).toHaveLength(0);
  });

  it("allows importing from src/shared/* from anywhere (FR-003)", async () => {
    const messages = await lintBoundaries(
      'import { getLogger } from "../../../shared/logging";\n',
      "src/bcs/governance/application/__fixture_importer.ts",
    );
    expect(messages).toHaveLength(0);
  });

  it("allows an intra-context import within the same bounded context (FR-004)", async () => {
    await withFixtureFile("src/bcs/governance/domain/__fixture_target.ts", async () => {
      const messages = await lintBoundaries(
        'import { fixtureTarget } from "../domain/__fixture_target";\n',
        "src/bcs/governance/application/__fixture_importer.ts",
      );
      expect(messages).toHaveLength(0);
    });
  });

  it("allows a context's own barrel to import its internals to re-export them", async () => {
    await withFixtureFile("src/bcs/governance/domain/__fixture_target.ts", async () => {
      const messages = await lintBoundaries(
        'export { fixtureTarget } from "./domain/__fixture_target";\n',
        "src/bcs/governance/index.ts",
      );
      expect(messages).toHaveLength(0);
    });
  });
});
