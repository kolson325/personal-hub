import { prisma } from "@/lib/db";
import { TopNav } from "@/app/_components/TopNav";

export const dynamic = "force-dynamic";

export default async function CombinePage() {
  const jobs = await prisma.agentJob.findMany({
    where: { kind: "combine_scan" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <main className="min-h-screen">
      <TopNav title="THE-COMBINE Updates" subtitle="Scans reported by your laptop companion (or later, GitHub)." />

      <section className="mx-auto max-w-4xl px-6 py-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Status</h2>
          <p className="mt-2 text-sm text-white/70">
            MVP note: this dashboard can’t directly read your Mac’s filesystem when it’s hosted in the cloud. The plan is
            a small “companion” process on your Mac that periodically scans the repo and posts summaries here.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Latest scans</h2>
          <ul className="mt-3 space-y-2">
            {jobs.length === 0 ? (
              <li className="text-sm text-white/60">No scans yet. Queue one from the AI panel.</li>
            ) : (
              jobs.map((j) => (
                <li key={j.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      {j.status} <span className="text-xs text-white/60">({j.createdAt.toISOString()})</span>
                    </div>
                  </div>
                  {j.resultText ? (
                    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/80">
                      {j.resultText}
                    </pre>
                  ) : null}
                  {j.errorText ? (
                    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
                      {j.errorText}
                    </pre>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </main>
  );
}
