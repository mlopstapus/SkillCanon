"use client";

import { useId, useState, useTransition } from "react";
import type { UserRole } from "@/bcs/identity-access";
import { Drawer } from "@/shared/ui";
import { createApiKeyAction } from "./actions";

export type IssueKeyDrawerProps = {
  role: UserRole;
  onClose: () => void;
  onIssued: (rawKey: string) => void;
};

/**
 * Mirrors `identity-access/domain/api-key.ts`'s `isScopeAllowedForRole`
 * exactly — duplicated (not imported) on purpose: that module's real export
 * pulls the whole `identity-access` barrel (including `createApiKey`,
 * `inviteUser`, etc.) into this client component's browser bundle, which
 * transitively drags in `nodemailer`/`postgres` and fails the Next.js build
 * (`Module not found: Can't resolve 'tls'`) — Node-only deps have no
 * browser build. `createApiKey`'s own server-side check remains the real
 * enforcement; a drift here would only be a UX inconvenience, never a
 * security gap.
 */
function isScopeAllowedForRole(scope: string, role: UserRole): boolean {
  return role === "admin" || scope.endsWith(":read");
}

const AVAILABLE_SCOPES = ["prompts:read", "prompts:write", "workflows:run"];
const EXPIRY_OPTIONS = [
  { label: "Never", value: "" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "1 year", value: "365" },
];

export function IssueKeyDrawer({ role, onClose, onIssued }: IssueKeyDrawerProps) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Set<string>>(new Set());
  const [expiry, setExpiry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleScope(scope: string) {
    if (!isScopeAllowedForRole(scope, role)) return;
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  }

  function submit() {
    if (scopes.size === 0) {
      setError("Select at least one scope.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const expiresInDays = expiry ? Number(expiry) : undefined;
      const result = await createApiKeyAction({
        name,
        scopes: Array.from(scopes),
        expiresInDays,
      });
      if (result.ok) {
        onIssued(result.rawKey);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Drawer onClose={onClose} labelledBy={titleId} widthClassName="w-[452px]">
        <div className="flex h-14 items-center justify-between border-b border-border px-5">
          <span id={titleId} className="font-display text-[15px] font-semibold">Issue API key</span>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7.5 place-items-center rounded-control border border-border text-dim"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4.5 overflow-y-auto px-5.5 py-5">
          {error ? (
            <div className="rounded-card border border-red/30 bg-red-soft p-3 text-[12px] text-red">
              {error}
            </div>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CI deploy key"
              className="rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-a"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Scopes</span>
            <div className="flex flex-col gap-1.5">
              {AVAILABLE_SCOPES.map((scope) => {
                const allowed = isScopeAllowedForRole(scope, role);
                return (
                  <label
                    key={scope}
                    className="flex items-center gap-2.5 rounded-control border border-border bg-surface px-2.5 py-2"
                    style={{ opacity: allowed ? 1 : 0.5 }}
                  >
                    <input
                      type="checkbox"
                      checked={scopes.has(scope)}
                      disabled={!allowed}
                      onChange={() => toggleScope(scope)}
                    />
                    <span className="font-mono text-[12.5px] text-text">{scope}</span>
                    {!allowed ? (
                      <span className="ml-auto font-mono text-[9.5px] text-faint">
                        admin only
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Expires</span>
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.label} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-border px-5.5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control border border-border-2 bg-surface px-4 py-2.5 text-[13px] font-semibold text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || !name}
            onClick={submit}
            className="rounded-control bg-a px-4.5 py-2.5 text-[13px] font-semibold text-a-fg shadow-glow disabled:opacity-50"
          >
            {isPending ? "Generating…" : "Generate key"}
          </button>
        </div>
    </Drawer>
  );
}
