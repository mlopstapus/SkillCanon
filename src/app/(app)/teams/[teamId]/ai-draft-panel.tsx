"use client";

import { useState, useTransition } from "react";
import type { InterviewDraft, InterviewMessage } from "@/bcs/distribution";
import { interviewAction } from "./actions";

export interface AiDraftPanelViewProps {
  messages: InterviewMessage[];
  drafts: InterviewDraft[];
  input: string;
  pending: boolean;
  error: string | null;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onUseDraft: (draft: InterviewDraft) => void;
}

/** Chat-style interview that proposes governance drafts; nothing is applied until a human reviews a draft in the normal drawer. */
export function AiDraftPanelView({ messages, drafts, input, pending, error, onInputChange, onSend, onUseDraft }: AiDraftPanelViewProps) {
  return (
    <section aria-label="AI assistant" className="mb-4 rounded-card border border-border-2 bg-surface p-4">
      <h2 className="text-[13px] font-medium text-text">Draft with AI</h2>
      <p className="mt-1 text-[12px] text-dim">
        Describe your goals and constraints. The assistant suggests drafts; you review and create each one yourself.
      </p>
      {messages.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {messages.map((message, index) => (
            <li key={index} className="text-[12.5px] leading-[1.5] text-dim">
              <span className="font-mono text-[11px] text-faint">{message.role === "user" ? "You" : "Assistant"}: </span>
              {message.content}
            </li>
          ))}
        </ul>
      ) : null}
      {drafts.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {drafts.map((draft, index) => (
            <li key={index} className="flex items-start gap-3 rounded-control border border-border p-2.5">
              <div className="min-w-0 flex-1">
                <span className="font-mono text-[12.5px] text-text">
                  {draft.kind === "policy" ? `Policy: ${draft.name}` : `Objective: ${draft.title}`}
                </span>
                <p className="mt-1 text-[12px] text-dim">{draft.kind === "policy" ? draft.content : draft.description}</p>
              </div>
              <button
                type="button"
                onClick={() => onUseDraft(draft)}
                className="flex-none rounded-control border border-border px-2 py-1 text-[11px] text-dim hover:text-text"
              >
                Review &amp; create
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-[12px] text-red">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <textarea
          aria-label="Message the AI assistant"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          rows={2}
          className="min-w-0 flex-1 rounded-control border border-border-2 bg-surface px-3 py-2 text-[12.5px] text-text"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={pending || input.trim() === ""}
          className="self-end rounded-control border border-border px-3 py-2 text-[12px] text-text disabled:opacity-50"
        >
          {pending ? "Thinking…" : "Send"}
        </button>
      </div>
    </section>
  );
}

export function AiDraftPanel({ onUseDraft }: { onUseDraft: (draft: InterviewDraft) => void }) {
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [drafts, setDrafts] = useState<InterviewDraft[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    const next: InterviewMessage[] = [...messages, { role: "user", content: input.trim() }];
    setMessages(next);
    setInput("");
    setError(null);
    startTransition(async () => {
      const result = await interviewAction(next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessages([...next, { role: "assistant", content: result.reply }]);
      setDrafts(result.drafts);
    });
  }

  return (
    <AiDraftPanelView
      messages={messages}
      drafts={drafts}
      input={input}
      pending={pending}
      error={error}
      onInputChange={setInput}
      onSend={send}
      onUseDraft={onUseDraft}
    />
  );
}
