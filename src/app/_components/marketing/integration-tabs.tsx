"use client";

import { useState } from "react";

export type CodeSampleKey = "cli" | "skillFile" | "curl";

export const DEFAULT_CODE_SAMPLE: CodeSampleKey = "cli";

export const CODE_SAMPLE_TABS: { key: CodeSampleKey; label: string }[] = [
  { key: "cli", label: "cli" },
  { key: "skillFile", label: "skill.md" },
  { key: "curl", label: "curl" },
];

export function CodeSample({ sample }: { sample: CodeSampleKey }) {
  if (sample === "skillFile") {
    return (
      <pre className="m-0 whitespace-pre-wrap font-mono text-[12.5px] leading-[1.75] text-dim">
        <span className="text-faint"># .claude/skills/skillcanon-code-review/SKILL.md</span>
        {"\n"}
        <span className="text-faint">---</span>
        {"\n"}
        <span className="text-text">name</span>: code-review
        {"\n"}
        <span className="text-text">description</span>: Governed code review — org policy
        enforced
        {"\n"}
        <span className="text-faint">---</span>
        {"\n"}
        Run <span className="text-a">skillcanon run code-review</span> and follow
        {"\n"}
        the returned instructions. Resolved live, never cached.
      </pre>
    );
  }

  if (sample === "curl") {
    return (
      <pre className="m-0 whitespace-pre-wrap font-mono text-[12.5px] leading-[1.75] text-dim">
        <span className="text-faint"># resolve a governed skill live over the API</span>
        {"\n"}
        curl -X POST http://localhost:8000/api/v1/prompts/expand/code-review \{"\n"}
        {"  "}-H <span className="text-a">&quot;Authorization: Bearer sk_YOUR_KEY&quot;</span>
        {"\n\n"}
        <span className="text-faint"># → returns the fully-governed prompt text,</span>
        {"\n"}
        <span className="text-faint">#   policies + objectives already injected</span>
      </pre>
    );
  }

  return (
    <pre className="m-0 whitespace-pre-wrap font-mono text-[12.5px] leading-[1.75] text-dim">
      <span className="text-faint"># link this repo to your SkillCanon project</span>
      {"\n"}$ skillcanon init --project-key <span className="text-a">pk_live_a3f1</span>
      {"\n\n"}
      <span className="text-a">✓</span> wrote .skillcanon/project.json
      {"\n"}
      <span className="text-a">✓</span> installed Claude Code SessionStart hook
      {"\n"}
      <span className="text-a">✓</span> synced <span className="text-text">14 skills</span> →
      .claude/skills/
    </pre>
  );
}

export function IntegrationTabs() {
  const [tab, setTab] = useState<CodeSampleKey>(DEFAULT_CODE_SAMPLE);

  return (
    <div className="overflow-hidden rounded-tile border border-border2 bg-bg-2 shadow-soft">
      <div className="flex gap-0.5 border-b border-border bg-surface px-2 pt-2">
        {CODE_SAMPLE_TABS.map((sampleTab) => (
          <button
            key={sampleTab.key}
            type="button"
            onClick={() => setTab(sampleTab.key)}
            className={`rounded-t-md px-3.5 py-2.25 font-mono text-[12px] ${
              sampleTab.key === tab
                ? "border-b-2 border-a text-a"
                : "border-b-2 border-transparent text-faint"
            }`}
          >
            {sampleTab.label}
          </button>
        ))}
      </div>
      <div className="min-h-[236px] px-5 pb-5.5 pt-5">
        <CodeSample sample={tab} />
      </div>
    </div>
  );
}
