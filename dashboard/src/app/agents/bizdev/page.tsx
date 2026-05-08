import { prisma } from "@/lib/db";
import { runBizDevAgent } from "./actions";
import { TopNav } from "@/app/_components/TopNav";
import { AskCodex } from "@/app/_components/AskCodex";
import { queueCodexTask } from "@/app/actions";
import { RunAgent } from "@/app/_components/RunAgent";

export const dynamic = "force-dynamic";

export default async function BizDevAgentPage() {
  const runs = await prisma.agentRun.findMany({
    where: { agentType: "bizdev" },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  return (
    <main className="min-h-screen">
      <TopNav
        title="BizDev Agent"
        subtitle="Research target corporations for snow removal + landscaping, then draft outreach."
      />

      <section className="mx-auto max-w-4xl px-6 py-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Run</h2>
          <div className="mt-3">
            <RunAgent
              title="BizDev notes (optional)"
              fieldName="notes"
              fieldPlaceholder="Optional: target regions, industries, brand proof points (KeyBank/GetGo), woman-owned certification details, etc."
              actionLabel="Run BizDev report"
              action={runBizDevAgent}
            />
          </div>
          <p className="mt-3 text-xs text-white/60">
            Real “deep dive” requires web search + an LLM key. This MVP stores runs and output for now.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Recent runs</h2>
          <div className="mt-3 space-y-3">
            {runs.length === 0 ? (
              <p className="text-sm text-white/60">No runs yet.</p>
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

        <div className="mt-4">
          <AskCodex
            title="Ask Codex (bizdev)"
            context="bizdev"
            placeholder="Examples: “Find 20 woke multi-site targets in Western PA/OH”, “Draft outreach email to facilities manager”, “Build a contact list plan.”"
            action={queueCodexTask}
          />
        </div>
      </section>
    </main>
  );
}
