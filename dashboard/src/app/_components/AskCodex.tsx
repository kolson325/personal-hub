"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import type { CodexQueueState } from "@/app/actions";

export function AskCodex({
  title = "Ask Codex",
  placeholder = "Ask a question or request an action…",
  actionLabel = "Send",
  context,
  action,
}: {
  title?: string;
  placeholder?: string;
  actionLabel?: string;
  context?: string;
  action: (prev: CodexQueueState, formData: FormData) => Promise<CodexQueueState>;
}) {
  const [text, setText] = useState("");
  const [state, formAction, pending] = useActionState<CodexQueueState, FormData>(action, {
    ok: false,
    error: "",
  });
  const ref = useRef<HTMLTextAreaElement | null>(null);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-white/60">{title}</div>
      <form
        action={(fd) => {
          const t = String(fd.get("text") ?? "").trim();
          if (!t) return;
          setText("");
          formAction(fd);
          ref.current?.focus();
        }}
        className="mt-2 grid gap-2"
      >
        {context ? <input type="hidden" name="context" value={context} /> : null}
        <textarea
          ref={ref}
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="min-h-20 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-fuchsia-500/50"
        />
        <button
          disabled={pending}
          className="w-fit rounded-xl bg-fuchsia-500 px-3 py-2 text-xs font-semibold text-black hover:bg-fuchsia-400 disabled:opacity-60"
        >
          {pending ? "Sending…" : actionLabel}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-white/50">
        <span>Runs locally when your laptop companion is connected.</span>
        <Link className="text-white/70 hover:text-white" href="/codex">
          Open Codex →
        </Link>
      </div>
      {!state.ok && state.error ? (
        <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {state.error}
        </div>
      ) : null}
      {state.ok ? (
        <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          Sent. View it in Codex.
        </div>
      ) : null}
    </div>
  );
}
