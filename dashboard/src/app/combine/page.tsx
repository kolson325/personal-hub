import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CombinePage() {
  const jobs = await prisma.agentJob.findMany({
    where: { kind: "combine_scan" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <main className="min-h-screen">
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">THE-COMBINE Updates</h1>
            <p className="text-xs text-white/60">Shows scans reported by the local companion (or later, GitHub).</p>
          </div>
          <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/">
            Back
          </Link>
        </div>
      </header>

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
