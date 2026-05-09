import Link from "next/link";
import type { AgentMemory, AgentRun } from "@prisma/client";
import type { AgentProfile } from "@/lib/agent-profiles";
import { AskCodex } from "@/app/_components/AskCodex";
import type { CodexQueueState } from "@/app/actions";
import type { RunAgentState } from "@/app/_components/RunAgent";
import { RunAgent } from "@/app/_components/RunAgent";

function fmt(d: Date | null | undefined) {
  if (!d) return "-";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function snippet(value: string | null | undefined, max = 4200) {
  const clean = String(value ?? "").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}\n\n[trimmed]`;
}

export function AgentReportSurface({
  profile,
  runs,
  memory,
  queueAction,
  runAction,
  runFieldName,
  runFieldPlaceholder,
}: {
  profile: AgentProfile;
  runs: AgentRun[];
  memory: AgentMemory[];
  queueAction: (prev: CodexQueueState, formData: FormData) => Promise<CodexQueueState>;
  runAction?: (prev: RunAgentState, formData: FormData) => Promise<RunAgentState>;
  runFieldName?: string;
  runFieldPlaceholder?: string;
}) {
  const latest = runs[0] ?? null;
  const latestMemory = memory.find((item) => item.key === "latest_highlights") ?? null;
  const runningContext = memory.find((item) => item.key === "running_context") ?? null;
  const completed = runs.filter((run) => run.status === "succeeded").length;
  const active = runs.find((run) => run.status === "running") ?? null;

  return (
    <div className="grid gap-4">
      <section className="border-b border-white/10 pb-4 sm:pb-5">
        <div className="grid gap-4 sm:flex sm:flex-wrap sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/50">{profile.cadence}</div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{profile.title}</h2>
            <p className="mt-2 text-sm leading-6 text-white/68">{profile.mission}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs sm:min-w-64">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-lg font-semibold">{completed}</div>
              <div className="text-white/50">done</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-lg font-semibold">{memory.length}</div>
              <div className="text-white/50">memory</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className={active ? "text-lg font-semibold text-emerald-300" : "text-lg font-semibold text-white/70"}>
                {active ? "on" : "idle"}
              </div>
              <div className="text-white/50">status</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Latest report</h3>
                <div className="mt-1 text-xs text-white/50">
                  {latest ? `${latest.status} • started ${fmt(latest.startedAt)} • finished ${fmt(latest.finishedAt)}` : "No report yet"}
                </div>
              </div>
              <Link className="min-h-10 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-center text-xs hover:bg-white/10" href="/codex">
                Watch live
              </Link>
            </div>
            {latest?.outputMarkdown ? (
              <pre className="mobile-report mt-4 max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-zinc-950/80 p-3 text-sm leading-6 text-white/82 sm:max-h-[520px] sm:p-4">
                {snippet(latest.outputMarkdown)}
              </pre>
            ) : latest?.error ? (
              <pre className="mobile-report mt-4 whitespace-pre-wrap rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100 sm:p-4">
                {latest.error}
              </pre>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/55 sm:p-5">
                Run the agent once to create the first saved report.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4">
            <h3 className="text-sm font-semibold">Report history</h3>
            <div className="mt-3 grid gap-2">
              {runs.length === 0 ? (
                <div className="text-sm text-white/55">No history yet.</div>
              ) : (
                runs.map((run) => (
                  <div key={run.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-white/80">{run.status}</span>
                      <span className="text-white/45">{fmt(run.startedAt)}</span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-white/55">
                      {run.outputMarkdown ? run.outputMarkdown.replace(/\s+/g, " ").slice(0, 220) : run.error ?? "Running..."}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <aside className="grid content-start gap-4">
          {runAction && runFieldName ? (
            <RunAgent
              title={`Run ${profile.shortTitle}`}
              fieldName={runFieldName}
              fieldPlaceholder={runFieldPlaceholder}
              actionLabel="Run report"
              action={runAction}
            />
          ) : null}

          <AskCodex
            title={`Ask ${profile.shortTitle}`}
            context={profile.id}
            placeholder={profile.defaultPrompt}
            action={queueAction}
          />

          <div className="rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4">
            <h3 className="text-sm font-semibold">Memory</h3>
            <div className="mt-3 grid gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-white/45">Latest highlights</div>
                <pre className="mobile-report mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-zinc-950/70 p-3 text-xs leading-5 text-white/72">
                  {snippet(latestMemory?.valueMarkdown, 2200) || "No saved highlights yet."}
                </pre>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-white/45">Long-term context</div>
                <pre className="mobile-report mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-zinc-950/70 p-3 text-xs leading-5 text-white/72">
                  {snippet(runningContext?.valueMarkdown, 2600) || "The agent will build this after reports complete."}
                </pre>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
