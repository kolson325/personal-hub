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
    <main className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">THE-COMBINE Updates</h1>
            <p className="text-xs text-neutral-500">Shows scans reported by the local companion (or later, GitHub).</p>
          </div>
          <Link className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50" href="/">
            Back
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-6">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold">Status</h2>
          <p className="mt-2 text-sm text-neutral-600">
            MVP note: this dashboard can’t directly read your Mac’s filesystem when it’s hosted in the cloud. The plan is
            a small “companion” process on your Mac that periodically scans the repo and posts summaries here.
          </p>
        </div>

        <div className="mt-4 rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold">Latest scans</h2>
          <ul className="mt-3 space-y-2">
            {jobs.length === 0 ? (
              <li className="text-sm text-neutral-500">No scans yet. Queue one from the AI panel.</li>
            ) : (
              jobs.map((j) => (
                <li key={j.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      {j.status} <span className="text-xs text-neutral-500">({j.createdAt.toISOString()})</span>
                    </div>
                  </div>
                  {j.resultText ? (
                    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-xs">
                      {j.resultText}
                    </pre>
                  ) : null}
                  {j.errorText ? (
                    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-xs text-red-900">
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
