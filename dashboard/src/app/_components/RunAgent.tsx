"use client";

import { useActionState, useRef, useState } from "react";

export type RunAgentState =
  | { ok: true; jobId: string }
  | { ok: false; error: string };

export function RunAgent({
  title = "Run agent",
  fieldName,
  fieldPlaceholder,
  actionLabel = "Run",
  action,
}: {
  title?: string;
  fieldName: string;
  fieldPlaceholder?: string;
  actionLabel?: string;
  action: (prev: RunAgentState, formData: FormData) => Promise<RunAgentState>;
}) {
  const [text, setText] = useState("");
  const [state, formAction, pending] = useActionState<RunAgentState, FormData>(action, {
    ok: false,
    error: "",
  });
  const ref = useRef<HTMLTextAreaElement | null>(null);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-white/60">{title}</div>
      <form
        action={(fd) => {
          // Always allow empty text (default report), but normalize to a trimmed string.
          fd.set(fieldName, String(fd.get(fieldName) ?? "").trim());
          setText("");
          formAction(fd);
          ref.current?.focus();
        }}
        className="mt-2 grid gap-2"
      >
        <textarea
          ref={ref}
          name={fieldName}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={fieldPlaceholder}
          className="min-h-20 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-fuchsia-500/50"
        />
        <button
          disabled={pending}
          className="w-fit rounded-xl bg-fuchsia-500 px-3 py-2 text-xs font-semibold text-black hover:bg-fuchsia-400 disabled:opacity-60"
        >
          {pending ? "Starting…" : actionLabel}
        </button>
      </form>

      {!state.ok && state.error ? (
        <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {state.error}
        </div>
      ) : null}
      {state.ok ? (
        <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          Queued. Open Codex to watch it run.
        </div>
      ) : null}
    </div>
  );
}

