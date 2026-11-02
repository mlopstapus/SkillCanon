"use client";

import { useState } from "react";
import { Badge } from "@/shared/ui";

export interface GateTabData {
  /** Admin or skill owner: may change the gate and override a candidate. */
  canManage: boolean;
  enabled: boolean;
  models: string[];
  minPassPct: number;
  /** Published versions newer than the active one that are not active yet. */
  candidates: string[];
}

export type GateActionResult = { ok: true } | { ok: false; error: string };

export interface GatePanelProps {
  gate: GateTabData;
  /** Models the provider pool offers. */
  poolModels: string[];
  onSetGate: (config: { enabled: boolean; models: string[]; minPassPct: number }) => Promise<GateActionResult>;
  onActivate: (version: string, reason: string) => Promise<GateActionResult>;
}

/** Gate settings and candidate list for the skill's Evals tab (017/005). */
export function GatePanel({ gate, poolModels, onSetGate, onActivate }: GatePanelProps) {
  const [models, setModels] = useState(gate.models);
  const [minPassPct, setMinPassPct] = useState(String(gate.minPassPct));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<GateActionResult>) => {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <section className="mt-6 rounded-card border border-border-2 bg-surface p-4" aria-label="Eval gate">
      <div className="flex items-center gap-2">
        <h3 className="text-[13px] font-medium text-text">Activation gate</h3>
        <Badge variant={gate.enabled ? "green" : "neutral"}>{gate.enabled ? "on" : "off"}</Badge>
      </div>
      <p className="mt-1 text-[12.5px] text-dim">
        {gate.enabled
          ? `A new version is held as a candidate until every gate model passes at ${gate.minPassPct}% or more.`
          : "Off: a published version activates immediately. Turn it on once the skill has eval cases and the pool has models."}
      </p>
      {gate.candidates.length > 0 ? (
        <ul className="mt-3 space-y-2" aria-label="Candidate versions">
          {gate.candidates.map((version) => (
            <li key={version} className="flex items-center gap-2 text-[12.5px] text-dim">
              <Badge variant="neutral">candidate</Badge>
              <span className="font-mono text-text">{version}</span>
              {gate.canManage ? (
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  className="ml-auto text-[12px] text-accent disabled:opacity-50"
                  onClick={() => run(() => onActivate(version, reason))}
                >
                  Activate anyway
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {gate.canManage ? (
        <div className="mt-3 space-y-3">
          {gate.candidates.length > 0 ? (
            <input
              aria-label="Override reason"
              placeholder="Reason for overriding the gate"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-card border border-border-2 bg-bg px-2 py-1 text-[12.5px] text-text"
            />
          ) : null}
          <fieldset className="flex flex-wrap gap-3" aria-label="Gate models">
            {poolModels.map((model) => (
              <label key={model} className="flex items-center gap-1.5 font-mono text-[12px] text-dim">
                <input
                  type="checkbox"
                  checked={models.includes(model)}
                  onChange={(e) => setModels(e.target.checked ? [...models, model] : models.filter((m) => m !== model))}
                />
                {model}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-[12.5px] text-dim">
            Minimum pass rate %
            <input
              type="number"
              min={0}
              max={100}
              value={minPassPct}
              onChange={(e) => setMinPassPct(e.target.value)}
              className="w-16 rounded-card border border-border-2 bg-bg px-2 py-1 text-text"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            className="text-[12.5px] text-accent disabled:opacity-50"
            onClick={() => run(() => onSetGate({ enabled: !gate.enabled, models, minPassPct: Number(minPassPct) }))}
          >
            {gate.enabled ? "Turn gate off" : "Turn gate on"}
          </button>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-[12px] text-red">{error}</p> : null}
    </section>
  );
}
