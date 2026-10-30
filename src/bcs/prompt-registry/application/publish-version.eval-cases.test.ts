import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { EVAL_CASES_FILE_NAME } from "../domain/eval-cases";
import { InvalidVersionFilesError } from "../domain/prompt";
import { createPromptInOrg, makePromptFixtureOrg } from "./prompt-test-helpers";
import { publishVersion } from "./publish-version";

// 017/002: evals/cases.yaml shape is validated at publish.
describe("publishVersion eval cases file", () => {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);
  afterAll(async () => {
    await testDb.teardown();
  });

  async function publish(evalYaml?: string) {
    const fixture = await makePromptFixtureOrg(testDb);
    const name = `evals-${crypto.randomUUID()}`;
    await createPromptInOrg(testDb, fixture, name);
    return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: name,
        version: "1.0.0",
        mainFile: { content: "content" },
        supportingFiles: evalYaml === undefined ? [] : [{ name: EVAL_CASES_FILE_NAME, content: evalYaml }],
      }),
    );
  }

  it("publishes without an eval file", async () => {
    await expect(publish()).resolves.toBeTruthy();
  });

  it("publishes valid assert and rubric cases", async () => {
    const yaml = `cases:
  - name: polite
    input: hello
    assert:
      - contains: hi
      - regex: "^h.*"
      - json_schema: { type: object }
  - input: explain
    rubric: Is it clear?
`;
    await expect(publish(yaml)).resolves.toBeTruthy();
  });

  it.each([
    ["invalid yaml", "cases: [unclosed"],
    ["no cases", "other: 1"],
    ["empty cases", "cases: []"],
    ["missing input", "cases:\n  - rubric: x"],
    ["both assert and rubric", "cases:\n  - input: a\n    rubric: x\n    assert: [{contains: y}]"],
    ["neither assert nor rubric", "cases:\n  - input: a"],
    ["unknown assertion", "cases:\n  - input: a\n    assert: [{equals: y}]"],
    ["bad regex", 'cases:\n  - input: a\n    assert: [{regex: "("}]'],
    ["duplicate names", "cases:\n  - {name: n, input: a, rubric: x}\n  - {name: n, input: b, rubric: x}"],
  ])("rejects %s", async (_label, yaml) => {
    await expect(publish(yaml)).rejects.toBeInstanceOf(InvalidVersionFilesError);
  });
});
