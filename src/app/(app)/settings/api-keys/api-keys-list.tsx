"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiKeySummary, AppSessionUser } from "@/bcs/identity-access";
import { Badge } from "@/shared/ui";
import { IssueKeyDrawer } from "./issue-key-drawer";
import { KeyRevealModal } from "./key-reveal-modal";
import { revokeApiKeyAction } from "./actions";

export type ApiKeysListProps = {
  currentUser: AppSessionUser;
  keys: ApiKeySummary[];
};

type ApiKeysListViewProps = ApiKeysListProps & {
  refresh: () => void;
};

function statusOf(key: ApiKeySummary): { label: string; variant: "green" | "red" } {
  if (!key.isActive) {
    return { label: "revoked", variant: "red" };
  }
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
    return { label: "expired", variant: "red" };
  }
  return { label: "active", variant: "green" };
}

export function ApiKeysListView({ currentUser, keys, refresh }: ApiKeysListViewProps) {
  const [issueOpen, setIssueOpen] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function revoke(keyId: string) {
    setRevoking(keyId);
    await revokeApiKeyAction({ keyId });
    setRevoking(null);
    refresh();
  }

  return (
    <main className="p-8">
      <div className="mb-1 flex items-start justify-between gap-4">
        <div>
          <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
            Account settings
          </p>
          <h1 className="font-display text-[21px] font-bold tracking-tight">API Keys</h1>
        </div>
        <button
          type="button"
          onClick={() => setIssueOpen(true)}
          className="rounded-control bg-a px-3.5 py-2 text-[13px] font-semibold text-a-fg shadow-glow"
        >
          Issue key
        </button>
      </div>
      <p className="mb-4.5 max-w-[640px] text-[12.5px] leading-relaxed text-dim">
        Keys authenticate MCP tools and REST calls outside the browser session. The raw key
        is shown once, right after you create it — after that only this prefix is ever
        displayed.
      </p>

      <div className="flex flex-col gap-2.5">
        {keys.length === 0 ? (
          <p className="text-[12.5px] text-dim">No API keys yet.</p>
        ) : (
          keys.map((k) => {
            const status = statusOf(k);
            return (
              <div
                key={k.id}
                className={`rounded-card border border-border bg-surface p-3.5 ${k.isActive ? "" : "opacity-60"}`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold">{k.name}</span>
                      <span className="font-mono text-[11px] text-faint">
                        {k.prefix}••••••••
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {k.scopes.map((s) => (
                        <span
                          key={s}
                          className="rounded-control bg-a-soft px-2 py-0.5 font-mono text-[10px] text-a"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex-none font-mono text-[11px] leading-relaxed text-faint">
                    <div>created {k.createdAt.toLocaleDateString()}</div>
                    <div>
                      last used{" "}
                      {k.lastUsedAt ? k.lastUsedAt.toLocaleDateString() : "never"}
                    </div>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {k.isActive ? (
                    <button
                      type="button"
                      disabled={revoking === k.id}
                      onClick={() => revoke(k.id)}
                      className="rounded-control border border-border-2 px-2.5 py-1.5 font-mono text-[11px] text-dim disabled:opacity-50"
                    >
                      {revoking === k.id ? "Revoking…" : "Revoke"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {issueOpen ? (
        <IssueKeyDrawer
          role={currentUser.role}
          onClose={() => setIssueOpen(false)}
          onIssued={(rawKey) => {
            setIssueOpen(false);
            setRevealKey(rawKey);
            refresh();
          }}
        />
      ) : null}

      {revealKey ? (
        <KeyRevealModal rawKey={revealKey} onClose={() => setRevealKey(null)} />
      ) : null}
    </main>
  );
}

export function ApiKeysList(props: ApiKeysListProps) {
  const router = useRouter();
  return <ApiKeysListView {...props} refresh={() => router.refresh()} />;
}
