import { parse } from "yaml";
import { InvalidVersionFilesError } from "./prompt";

/** The one recognised eval file: an ordinary supporting file (017/002, PDR-020). */
export const EVAL_CASES_FILE_NAME = "evals/cases.yaml";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

function checkAssertion(a: unknown): string | null {
  if (!isRecord(a) || Object.keys(a).length !== 1) {
    return "each assertion must be a mapping with exactly one of contains, regex, json_schema";
  }
  const [type, value] = Object.entries(a)[0]!;
  if (type === "contains") return isText(value) ? null : "contains must be a non-empty string";
  if (type === "regex") {
    if (!isText(value)) return "regex must be a non-empty string";
    try {
      new RegExp(value);
      return null;
    } catch {
      return "regex does not compile";
    }
  }
  if (type === "json_schema") return isRecord(value) ? null : "json_schema must be a mapping";
  return `unknown assertion type "${type}"`;
}

export type EvalAssertion =
  | { type: "contains"; value: string }
  | { type: "regex"; value: string }
  | { type: "json_schema"; value: Record<string, unknown> };

/** A validated eval case: deterministic `assert`s or a judge `rubric`, never both. */
export interface EvalCase {
  /** `name` when given, else `case-N` (1-based). */
  id: string;
  input: string;
  assert?: EvalAssertion[];
  rubric?: string;
}

/**
 * Parses and validates `evals/cases.yaml`. Throws `InvalidVersionFilesError`
 * (mapped to 422) naming the first problem; never executes anything.
 */
export function parseEvalCases(content: string): EvalCase[] {
  const fail = (msg: string): never => {
    throw new InvalidVersionFilesError(`${EVAL_CASES_FILE_NAME}: ${msg}.`);
  };
  let doc: unknown;
  try {
    doc = parse(content);
  } catch {
    return fail("not valid YAML");
  }
  if (!isRecord(doc) || !Array.isArray(doc.cases) || doc.cases.length === 0) {
    return fail("must be a mapping with a non-empty `cases` list");
  }
  const names = new Set<string>();
  const parsed: EvalCase[] = [];
  doc.cases.forEach((c: unknown, i: number) => {
    const label = `case ${i + 1}`;
    if (!isRecord(c)) return fail(`${label} must be a mapping`);
    if (!isText(c.input)) return fail(`${label} needs a non-empty string \`input\``);
    if (c.name !== undefined) {
      if (!isText(c.name) || names.has(c.name)) return fail(`${label} name must be a unique non-empty string`);
      names.add(c.name);
    }
    const hasAssert = c.assert !== undefined;
    const hasRubric = c.rubric !== undefined;
    if (hasAssert === hasRubric) return fail(`${label} needs exactly one of \`assert\` or \`rubric\``);
    const id = typeof c.name === "string" ? c.name : `case-${i + 1}`;
    if (hasRubric) {
      if (!isText(c.rubric)) return fail(`${label} rubric must be a non-empty string`);
      parsed.push({ id, input: c.input, rubric: c.rubric });
      return;
    }
    if (!Array.isArray(c.assert) || c.assert.length === 0) return fail(`${label} assert must be a non-empty list`);
    for (const a of c.assert) {
      const problem = checkAssertion(a);
      if (problem) return fail(`${label}: ${problem}`);
    }
    parsed.push({
      id,
      input: c.input,
      assert: (c.assert as Record<string, unknown>[]).map((a) => {
        const [type, value] = Object.entries(a)[0]!;
        return { type, value } as EvalAssertion;
      }),
    });
  });
  return parsed;
}

/** Shape check only (publish time); see `parseEvalCases`. */
export function validateEvalCases(content: string): void {
  parseEvalCases(content);
}
