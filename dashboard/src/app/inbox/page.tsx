import { prisma } from "@/lib/db";
import { TopNav } from "@/app/_components/TopNav";
import { AskCodex } from "@/app/_components/AskCodex";
import { queueCodexTask } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const runs = await prisma.agentRun.findMany({
    where: { agentType: "gmail" },
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  return (
    <main className="min-h-screen">
      <TopNav title="Inbox (Gmail)" subtitle="Triage + capture important threads into Tasks (requires laptop companion/Codex)." />

      <section className="mx-auto max-w-5xl px-6 py-6">
        <AskCodex
          title="Ask Codex (gmail)"
          context="gmail"
          placeholder='Examples: “Triage my inbox and create tasks for anything urgent”, “Summarize KeyBank/GetGo threads”, “Find emails that need a reply today.”'
          action={queueCodexTask}
        />

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Recent triage runs</h2>
          <div className="mt-3 space-y-3">
            {runs.length === 0 ? (
              <div className="text-sm text-white/60">No runs yet. Schedule “Gmail inbox triage” in Automations.</div>
            ) : (
              runs.map((r) => (
                <div key={r.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{r.status}</div>
                    <div className="text-xs text-white/60">{r.startedAt.toISOString()}</div>
                  </div>
                  {r.outputMarkdown ? (
                    <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/80">
                      {r.outputMarkdown}
                    </pre>
                  ) : null}
                  {r.error ? (
                    <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
                      {r.error}
                    </pre>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

