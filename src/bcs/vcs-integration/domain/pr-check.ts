export interface RequiredSkillResult {
  skillName: string;
  satisfied: boolean;
  matchedCommitSha: string | null;
}

export type PrCheckStatus = "pass" | "fail" | "neutral";

/**
 * Matches each required skill to usage by skill NAME only (any version) on any
 * commit of the PR (vcs-integration CONTRACT stability guarantee).
 */
export function evaluateRequiredSkills(
  required: string[],
  usage: Array<{ skillName: string; gitCommitSha: string }>,
): { status: "pass" | "fail"; results: RequiredSkillResult[] } {
  const results = [...new Set(required)].sort().map((skillName) => {
    const match = usage.find((u) => u.skillName === skillName);
    return { skillName, satisfied: match !== undefined, matchedCommitSha: match?.gitCommitSha ?? null };
  });
  return { status: results.every((r) => r.satisfied) ? "pass" : "fail", results };
}

const CONCLUSION = { pass: "success", fail: "failure", neutral: "neutral" } as const;
export const checkConclusion = (status: PrCheckStatus) => CONCLUSION[status];

/** Plain-language check run text a PR author can act on. */
export function describeCheck(status: PrCheckStatus, results: RequiredSkillResult[], error?: string): { title: string; summary: string } {
  if (status === "neutral") {
    return {
      title: "Could not evaluate required skills",
      summary: `SkillCanon could not check this pull request${error ? `: ${error}` : "."} This does not mean a skill is missing. It will be checked again on the next push.`,
    };
  }
  const missing = results.filter((r) => !r.satisfied);
  const ran = results.filter((r) => r.satisfied);
  if (results.length === 0) return { title: "No required skills", summary: "This project has no required skills, so there is nothing to check." };
  const lines = [
    ...ran.map((r) => `- ran: ${r.skillName}`),
    ...missing.map((r) => `- missing: ${r.skillName}`),
  ];
  return status === "pass"
    ? { title: "All required skills ran", summary: `Every required skill was run with the SkillCanon CLI on this pull request's commits.\n\n${lines.join("\n")}` }
    : {
        title: `${missing.length} required skill${missing.length === 1 ? "" : "s"} did not run`,
        summary: `Run the missing skill${missing.length === 1 ? "" : "s"} with \`skillcanon run <name>\` from this branch, then push again.\n\n${lines.join("\n")}\n\nThis check is informational and does not block merging.`,
      };
}
