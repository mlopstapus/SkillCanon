"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EvalProviderConfigView } from "@/bcs/prompt-registry";
import { removeProviderAction, saveProviderAction, setEnabledAction, setJudgeAction } from "./actions";

// Mirrors EVAL_PROVIDER_IDS; not imported because a client component must not pull the BC barrel into the browser bundle.
const PROVIDERS = ["anthropic", "openai"] as const;

type Props = { isAdmin: boolean; config: EvalProviderConfigView; enabled: boolean };

export function EvalProvidersView({ isAdmin, config, enabled, refresh }: Props & { refresh: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [judge, setJudge] = useState(config.defaultJudge ?? "");

  async function act(p: Promise<{ ok: boolean; error?: string }>) {
    const r = await p;
    setError(r.ok ? null : (r.error ?? "Failed."));
    if (r.ok) refresh();
  }

  return (
    <main className="p-8">
      <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">Organization settings</p>
      <h1 className="font-display text-[21px] font-bold tracking-tight">Eval providers</h1>
      <p className="mb-4.5 mt-1 max-w-[640px] text-[12.5px] leading-relaxed text-dim">
        Skill evals run on the server using the provider keys you enter here. Keys are stored encrypted and are never shown again.
        Turning evals on sends skill content and eval cases to these providers.
      </p>
      {!isAdmin && <p className="text-[12.5px] text-dim">Only an organization admin can change these settings.</p>}
      {error && <p role="alert" className="mb-3 text-[12.5px] text-red-400">{error}</p>}

      <label className="mb-5 flex items-center gap-2 text-[13px]">
        <input type="checkbox" disabled={!isAdmin} checked={enabled} onChange={(e) => act(setEnabledAction(e.target.checked))} />
        Enable evals for this organization (consent to send skill content to the providers below)
      </label>

      {PROVIDERS.map((id) => (
        <ProviderForm key={id} id={id} current={config.providers.find((p) => p.provider === id)} isAdmin={isAdmin} act={act} />
      ))}

      <div className="mt-5 max-w-[520px]">
        <label className="mb-1 block text-[12px] text-dim" htmlFor="judge">Default judge model (e.g. anthropic/claude-sonnet-5-5)</label>
        <div className="flex gap-2">
          <input id="judge" disabled={!isAdmin} value={judge} onChange={(e) => setJudge(e.target.value)} className="flex-1 rounded-control border border-border2 bg-surface2 px-2 py-1.5 text-[13px]" />
          <button type="button" disabled={!isAdmin} onClick={() => act(setJudgeAction(judge.trim() || null))} className="rounded-control bg-a px-3 py-1.5 text-[13px] font-semibold text-a-fg">Save</button>
        </div>
      </div>
    </main>
  );
}

function ProviderForm({ id, current, isAdmin, act }: {
  id: string;
  current?: EvalProviderConfigView["providers"][number];
  isAdmin: boolean;
  act: (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState(current?.models.join(", ") ?? "");
  return (
    <section className="mb-4 max-w-[520px] rounded-control border border-border2 p-4">
      <h2 className="mb-2 text-[14px] font-semibold capitalize">
        {id} {current && <span className="ml-2 font-mono text-[11px] text-green-400">key set</span>}
      </h2>
      <label className="mb-1 block text-[12px] text-dim" htmlFor={`${id}-key`}>API key{current ? " (leave blank to keep the current key)" : ""}</label>
      <input id={`${id}-key`} type="password" autoComplete="off" disabled={!isAdmin} value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mb-2 w-full rounded-control border border-border2 bg-surface2 px-2 py-1.5 text-[13px]" />
      <label className="mb-1 block text-[12px] text-dim" htmlFor={`${id}-models`}>Allowed models, comma separated</label>
      <input id={`${id}-models`} disabled={!isAdmin} value={models} onChange={(e) => setModels(e.target.value)} className="mb-3 w-full rounded-control border border-border2 bg-surface2 px-2 py-1.5 text-[13px]" />
      <div className="flex gap-2">
        <button type="button" disabled={!isAdmin} onClick={() => act(saveProviderAction({ provider: id, apiKey: apiKey || undefined, models: models.split(",") }).then((r) => { if (r.ok) setApiKey(""); return r; }))} className="rounded-control bg-a px-3 py-1.5 text-[13px] font-semibold text-a-fg">Save</button>
        {current && <button type="button" disabled={!isAdmin} onClick={() => act(removeProviderAction(id))} className="rounded-control border border-border2 px-3 py-1.5 text-[13px]">Remove</button>}
      </div>
    </section>
  );
}

export function EvalProviders(props: Props) {
  const router = useRouter();
  return <EvalProvidersView {...props} refresh={() => router.refresh()} />;
}
