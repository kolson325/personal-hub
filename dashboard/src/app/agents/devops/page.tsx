import Link from "next/link";
import { prisma } from "@/lib/db";
import { runDevOpsAgent } from "./actions";

export const dynamic = "force-dynamic";

export default async function DevOpsAgentPage() {
  const runs = await prisma.agentRun.findMany({
    where: { agentType: "devops" },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">DevOps Tech Radar Agent</h1>
            <p className="text-xs text-neutral-500">
              New tech summaries + how to implement them (Octopus/Jenkins/Backstage/Atlassian/Teams/JBoss/Grafana/Kibana).
            </p>
          </div>
          <Link className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50" href="/">
            Back
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-6">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold">Run</h2>
          <form action={runDevOpsAgent} className="mt-3 grid gap-2">
            <textarea
              name="focus"
              placeholder="What do you want updated? (e.g., Backstage 2026 best practices, Jenkins → GitHub Actions migration, OpenTelemetry rollout, etc.)"
              className="min-h-24 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
            />
            <button className="w-fit rounded-lg bg-black px-3 py-2 text-sm font-medium text-white">Run agent</button>
          </form>
        </div>

        <div className="mt-4 rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold">Recent runs</h2>
          <div className="mt-3 space-y-3">
            {runs.length === 0 ? (
              <p className="text-sm text-neutral-500">No runs yet.</p>
            ) : (
              runs.map((r) => (
                <div key={r.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{r.status}</div>
                    <div className="text-xs text-neutral-500">{r.startedAt.toISOString()}</div>
                  </div>
                  {r.outputMarkdown ? (
                    <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-xs">{r.outputMarkdown}</pre>
                  ) : null}
                  {r.error ? (
                    <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-xs text-red-900">{r.error}</pre>
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
