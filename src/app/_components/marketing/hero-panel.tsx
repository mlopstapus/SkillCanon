"use client";

import { useState } from "react";

export type HeroView = "skills" | "graph";

export const DEFAULT_HERO_VIEW: HeroView = "skills";

export function otherHeroView(view: HeroView): HeroView {
  return view === "skills" ? "graph" : "skills";
}

const SKILLS = [
  { name: "new-feature", description: "Start a new feature — plan → build → test", tag: "skill" },
  { name: "plan-feature", description: "Generate a structured implementation plan" },
  { name: "code-review", description: "Perform a thorough code review" },
  { name: "finish-pr", description: "Test, document, commit, review" },
];

function SkillsView() {
  return (
    <div className="px-4.5 pb-4.5 pt-4">
      <div className="mb-3 font-mono text-[12.5px] text-faint">
        <span className="text-a">›</span> skillcanon sync —{" "}
        <span className="text-text">14 skills</span> installed in .claude/skills/
      </div>
      <div className="flex flex-col gap-1.75">
        {SKILLS.map((skill) => (
          <div
            key={skill.name}
            className={`flex items-center gap-2.5 rounded-tile border px-2.75 py-2.25 ${
              skill.tag ? "border-border2 bg-a-soft" : "border-border bg-surface"
            }`}
          >
            <span className="font-mono text-[12.5px] font-semibold text-a">{skill.name}</span>
            <span className="text-[12px] text-dim">{skill.description}</span>
            {skill.tag ? (
              <span className="ml-auto font-mono text-[10px] text-faint">{skill.tag}</span>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-3.25 rounded-tile border border-dashed border-a/45 bg-a-soft/50 px-3 py-2.75">
        <div className="mb-2 flex items-center gap-2">
          <span className="size-1.75 rounded-full bg-a" />
          <span className="font-mono text-[11px] font-semibold text-a">
            policy injected · MLOps → Engineering → Org
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-md border border-border bg-surface-2 px-2 py-0.75 font-mono text-[10.5px] text-dim">
            + always-write-tests
          </span>
          <span className="rounded-md border border-border bg-surface-2 px-2 py-0.75 font-mono text-[10.5px] text-dim">
            + no-secrets-in-logs
          </span>
          <span className="rounded-md border border-border bg-surface-2 px-2 py-0.75 font-mono text-[10.5px] text-dim">
            objective: ship-p50-latency
          </span>
        </div>
      </div>
      <div className="mt-3.25 flex items-center gap-1.5 font-mono text-[12.5px] text-dim">
        <span className="text-a">$</span> /plan-feature build a feature store
      </div>
    </div>
  );
}

const GRAPH_NODES = [
  { label: "Engineering", left: "14%", top: 112 },
  { label: "Design", right: "9%", top: 112 },
  { label: "MLOps", left: "9%", top: 214, faint: true },
  { label: "alice", left: "33%", top: 214, faint: true },
  { label: "dave", right: "22%", top: 214, faint: true },
];

function GraphView() {
  return (
    <div className="relative min-h-[320px] px-4.5 py-5.5">
      <svg viewBox="0 0 420 300" className="h-auto w-full" fill="none">
        <line x1="210" y1="46" x2="120" y2="118" stroke="var(--a)" strokeWidth="1.5" strokeDasharray="4 4" />
        <line x1="210" y1="46" x2="300" y2="118" stroke="var(--a)" strokeWidth="1.5" strokeDasharray="4 4" />
        <line x1="120" y1="146" x2="80" y2="222" stroke="var(--border2)" strokeWidth="1.5" />
        <line x1="120" y1="146" x2="160" y2="222" stroke="var(--border2)" strokeWidth="1.5" />
        <line x1="300" y1="146" x2="300" y2="222" stroke="var(--border2)" strokeWidth="1.5" />
      </svg>
      <div className="absolute left-1/2 top-6 -translate-x-1/2 text-center">
        <div className="rounded-tile bg-gradient-to-br from-a to-a-2 px-4 py-2 font-mono text-[12.5px] font-bold text-a-fg shadow-glow">
          Org
        </div>
      </div>
      {GRAPH_NODES.map((node) => (
        <div
          key={node.label}
          className={`absolute rounded-tile font-mono text-[12px] ${
            node.faint
              ? "border border-border bg-bg px-3 py-1.75 text-dim"
              : "border border-border2 bg-surface px-3.25 py-1.75 text-text"
          }`}
          style={{ left: node.left, right: node.right, top: node.top }}
        >
          {node.label}
        </div>
      ))}
      <div className="absolute bottom-3.5 left-1/2 flex -translate-x-1/2 gap-1.5">
        <span className="rounded-md bg-a-soft px-2 py-0.75 font-mono text-[10px] text-a">
          inherited ↓ immutable
        </span>
        <span className="rounded-md border border-border bg-surface-2 px-2 py-0.75 font-mono text-[10px] text-dim">
          local ✎ mutable
        </span>
      </div>
    </div>
  );
}

export function HeroPanel() {
  const [view, setView] = useState<HeroView>(DEFAULT_HERO_VIEW);

  return (
    <div className="relative overflow-hidden rounded-tile border border-border2 bg-bg-2 shadow-heavy">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3.5 py-3">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 font-mono text-[12px] text-faint">
          claude code — .claude/skills/
        </span>
        <span className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => setView("skills")}
            className={`rounded-md px-2 py-0.75 font-mono text-[10.5px] ${
              view === "skills"
                ? "border border-border2 bg-a-soft text-a"
                : "border border-transparent text-faint"
            }`}
          >
            skills
          </button>
          <button
            type="button"
            onClick={() => setView("graph")}
            className={`rounded-md px-2 py-0.75 font-mono text-[10.5px] ${
              view === "graph"
                ? "border border-border2 bg-a-soft text-a"
                : "border border-transparent text-faint"
            }`}
          >
            graph
          </button>
        </span>
      </div>
      {view === "skills" ? <SkillsView /> : <GraphView />}
    </div>
  );
}
