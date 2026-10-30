import Ajv from "ajv";
import type { EvalAssertion } from "./eval-cases";

const ajv = new Ajv({ strict: false });

/** Evaluates one deterministic assertion against a model's output. */
export function checkAssertion(a: EvalAssertion, output: string): boolean {
  switch (a.type) {
    case "contains":
      return output.includes(a.value);
    case "regex":
      return new RegExp(a.value).test(output);
    case "json_schema": {
      let data: unknown;
      try {
        data = JSON.parse(output);
      } catch {
        return false;
      }
      try {
        return ajv.validate(a.value, data) === true;
      } catch {
        return false; // an uncompilable schema never passes
      }
    }
  }
}

/** Score 0..100 = share of assertions that held; passes only when all do. */
export function scoreAssertions(assertions: EvalAssertion[], output: string) {
  const held = assertions.filter((a) => checkAssertion(a, output)).length;
  return { passed: held === assertions.length, scorePct: Math.round((held / assertions.length) * 100) };
}

export function judgePrompt(rubric: string, input: string, output: string): { system: string; user: string } {
  return {
    system:
      'You grade an AI answer against a rubric. Reply with only JSON: {"score": <number 0 to 1>, "reason": "<short>"}.',
    user: `Rubric:\n${rubric}\n\nInput:\n${input}\n\nAnswer:\n${output}`,
  };
}

/** Parses the judge's reply; null when it is not a usable score. */
export function parseJudgeScore(text: string): number | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const score = (JSON.parse(match[0]) as { score?: unknown }).score;
    return typeof score === "number" && score >= 0 && score <= 1 ? score : null;
  } catch {
    return null;
  }
}
