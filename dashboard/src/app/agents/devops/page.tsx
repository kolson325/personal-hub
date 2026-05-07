import { prisma } from "@/lib/db";
import { runDevOpsAgent } from "./actions";
import { TopNav } from "@/app/_components/TopNav";
import { AskCodex } from "@/app/_components/AskCodex";
import { queueCodexTask } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function DevOpsAgentPage() {
  const runs = await prisma.agentRun.findMany({
    where: { agentType: "devops" },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  return (
    <main className="min-h-screen">
      <TopNav
        title="DevOps Tech Radar Agent"
        subtitle="New tech summaries + implementation ideas (Octopus/Jenkins/Backstage/Atlassian/Teams/JBoss/Grafana/Kibana)."
      />

      <section className="mx-auto max-w-4xl px-6 py-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Run</h2>
          <form action={runDevOpsAgent} className="mt-3 grid gap-2">
            <textarea
              name="focus"
              placeholder="What do you want updated? (e.g., Backstage 2026 best practices, Jenkins → GitHub Actions migration, OpenTelemetry rollout, etc.)"
              className="min-h-24 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
            />
            <button className="w-fit rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90">
              Run agent
            </button>
          </form>
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
            title="Ask Codex (devops)"
            context="devops"
            placeholder="Examples: “What’s new in OpenTelemetry and how to roll it out at work?”, “Backstage 2026 best practices”, “JBoss → modern platform migration plan.”"
            action={queueCodexTask}
          />
        </div>
      </section>
    </main>
  );
}
