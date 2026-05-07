"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { CodexQueueState } from "@/app/actions";
import { QuickPrompts } from "@/app/_components/QuickPrompts";

type CodexJob = {
  id: string;
  status: string;
  createdAt: string;
  claimedAt: string | null;
  finishedAt?: string | null;
  payload: { text?: string; context?: string };
  resultText: string | null;
  errorText: string | null;
};

type CodexState = {
  ok: true;
  active: CodexJob | null;
  recent: CodexJob[];
};

function formatTs(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(status: string) {
  if (status === "QUEUED") return "Queued";
  if (status === "CLAIMED") return "Running";
  if (status === "SUCCEEDED") return "Done";
  if (status === "FAILED") return "Failed";
  if (status === "CANCELED") return "Canceled";
  return status;
}

export function CodexChat({
  action,
  initialState,
}: {
  action: (prev: CodexQueueState, formData: FormData) => Promise<CodexQueueState>;
  initialState: CodexQueueState;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [text, setText] = useState("");
  const [remote, setRemote] = useState<CodexState | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/codex/state", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as CodexState | null;
      if (!res.ok || !json?.ok) throw new Error(`HTTP ${res.status}`);
      setRemote(json);
      setNetworkError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setNetworkError(msg);
    }
  }

  useEffect(() => {
    const start = setTimeout(() => void refresh(), 0);
    const t = setInterval(() => void refresh(), 1500);
    return () => {
      clearTimeout(start);
      clearInterval(t);
    };
  }, []);

  const messages = useMemo(() => {
    const jobs = remote?.recent ?? [];
    const out: Array<{ key: string; who: "you" | "codex"; at: string; body: string; meta?: string }> = [];
    for (const j of jobs) {
      const prompt = String(j.payload?.text ?? "").trim();
      if (prompt) {
        out.push({
          key: `${j.id}:you`,
          who: "you",
          at: j.createdAt,
          body: prompt,
          meta: j.payload?.context ? `context: ${j.payload.context}` : undefined,
        });
      }

      let body = "";
      if (j.status === "FAILED") body = j.errorText || j.resultText || "Failed.";
      else if (j.resultText) body = j.resultText;
      else if (j.status === "QUEUED") body = "Queued…";
      else body = "Thinking…";

      out.push({
        key: `${j.id}:codex`,
        who: "codex",
        at: j.createdAt,
        body,
        meta: statusLabel(j.status),
      });
    }
    return out;
  }, [remote]);

  const active = remote?.active ?? null;
  const lockedError =
    !state.ok && state.error && state.error.includes("Another Codex run") ? state.error : null;

  const quick = [
    {
      label: "Morning plan",
      text: "Give me a tight morning brief: 1) top 3 priorities, 2) what to ignore, 3) the next action for each, 4) a 90-minute focus block plan. Keep it decisive.",
    },
    {
      label: "Allsite today",
      text: "Summarize today’s Allsite submissions: top issues, critical sites/vendors, and the 3 follow-ups that matter most. Draft the messages.",
    },
    {
      label: "DevOps learn",
      text: "Teach me one modern DevOps concept I can apply this week (simple explanation, why it matters, how to implement, and a 30-minute starter task). No fluff.",
    },
    {
      label: "Midday reset",
      text: "Midday reset: based on what I’ve done so far, re-plan the rest of today into 2 focus blocks + 1 admin block. Keep it ruthless and realistic.",
    },
    {
      label: "Evening wrap",
      text: "End-of-day wrap: summarize wins, open loops, and write tomorrow’s top 3 with next actions. Keep it short and actionable.",
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Codex</div>
            <div className="mt-1 text-xs text-white/60">
              Chat-style view of LOCAL Codex runs. Only one run at a time.
            </div>
          </div>
          <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10" href="/ai">
            Jobs →
          </Link>
        </div>

        {active ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-white/60">
                Active: <span className="text-white/80">{statusLabel(active.status)}</span> •{" "}
                <span className="text-white/70">{formatTs(active.createdAt)}</span>
              </div>
              <div className="text-xs text-white/60">
                Companion:{" "}
                <span className={active.status === "CLAIMED" ? "text-emerald-300" : "text-white/70"}>
                  {active.status === "CLAIMED" ? "connected" : "waiting"}
                </span>
              </div>
            </div>
            <div className="mt-3 text-xs text-white/60">
              {active.payload?.context ? `context: ${active.payload.context}` : "context: —"}
            </div>
            <div className="mt-3 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white/90">
              {active.resultText
                ? active.resultText
                : active.status === "QUEUED"
                  ? "Queued… (waiting for your laptop companion to claim it)"
                  : "Thinking…"}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
            No active run.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-sm font-semibold">New request</div>
        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Quick prompts</div>
          <div className="mt-2">
            <QuickPrompts
              prompts={quick}
              onPick={(t) => {
                setText(t);
                inputRef.current?.focus();
              }}
            />
          </div>
        </div>
        <form
          action={(fd) => {
            const t = String(fd.get("text") ?? "").trim();
            if (!t) return;
            setText("");
            formAction(fd);
            inputRef.current?.focus();
            setTimeout(() => void refresh(), 0);
          }}
          className="mt-3 grid gap-2"
        >
          <textarea
            ref={inputRef}
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='Try: “Summarize today’s Allsite issues”, “Create a new budgeting category”, “Review THE-COMBINE UI for polish ideas.”'
            className="min-h-28 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-fuchsia-500/50"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={pending}
              className="w-fit rounded-xl bg-fuchsia-500 px-3 py-2 text-sm font-semibold text-black hover:bg-fuchsia-400 disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send"}
            </button>
            <span className="text-xs text-white/60">
              Uses your laptop companion. If it’s not running, requests stay queued.
            </span>
          </div>
          {lockedError ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              {lockedError}
            </div>
          ) : null}
          {!state.ok && state.error && !lockedError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
              {state.error}
            </div>
          ) : null}
        </form>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">Conversation</div>
          <button
            onClick={() => void refresh()}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
        {networkError ? <div className="mt-3 text-xs text-red-200">Fetch error: {networkError}</div> : null}
        <div className="mt-4 grid gap-3">
          {messages.length === 0 ? (
            <div className="text-sm text-white/60">No Codex runs yet.</div>
          ) : (
            messages.map((m) => (
              <div
                key={m.key}
                className={
                  m.who === "you"
                    ? "ml-auto w-full max-w-[42rem] rounded-2xl border border-white/10 bg-black/30 p-4"
                    : "mr-auto w-full max-w-[42rem] rounded-2xl border border-white/10 bg-white/5 p-4"
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
                    {m.who === "you" ? "You" : "Codex"}
                  </div>
                  <div className="text-xs text-white/50">{formatTs(m.at)}</div>
                </div>
                {m.meta ? <div className="mt-2 text-xs text-white/50">{m.meta}</div> : null}
                <div className="mt-2 whitespace-pre-wrap text-sm text-white/90">{m.body}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
