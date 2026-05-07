"use client";

import { useState } from "react";

export function AskCodex({
  title = "Ask Codex",
  placeholder = "Ask a question or request an action…",
  actionLabel = "Queue",
  context,
  action,
}: {
  title?: string;
  placeholder?: string;
  actionLabel?: string;
  context?: string;
  action: (formData: FormData) => void;
}) {
  const [text, setText] = useState("");

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-white/60">{title}</div>
      <form
        action={(fd) => {
          const t = String(fd.get("text") ?? "").trim();
          if (!t) return;
          action(fd);
          setText("");
        }}
        className="mt-2 grid gap-2"
      >
        {context ? <input type="hidden" name="context" value={context} /> : null}
        <textarea
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="min-h-20 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-fuchsia-500/50"
        />
        <button className="w-fit rounded-xl bg-fuchsia-500 px-3 py-2 text-xs font-semibold text-black hover:bg-fuchsia-400">
          {actionLabel}
        </button>
      </form>
      <div className="mt-2 text-xs text-white/50">
        Runs locally when your laptop companion is connected. Check the AI page for results.
      </div>
    </div>
  );
}
