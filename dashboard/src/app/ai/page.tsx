import { prisma } from "@/lib/db";
import { cancelJob, queueJob } from "./actions";
import { TopNav } from "@/app/_components/TopNav";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const jobs = await prisma.agentJob.findMany({ orderBy: { createdAt: "desc" }, take: 25 });

  return (
    <main className="min-h-screen">
      <TopNav title="AI / Agent Jobs" subtitle="Queue tasks for your laptop companion + Codex hook." />

      <section className="mx-auto max-w-4xl px-6 py-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Queue a job</h2>
          <form action={queueJob} className="mt-3 grid gap-2">
            <label className="text-xs font-medium text-white/70">Job type</label>
            <select name="kind" className="w-fit rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm">
              <option value="note">Note / task</option>
              <option value="shell">Shell (approved) command</option>
              <option value="combine_scan">Scan THE-COMBINE updates</option>
            </select>
            <textarea
              name="text"
              placeholder="Describe what you want the agent to do (later: this will be executed by a companion on your Mac or by a cloud agent)."
              className="min-h-28 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
            />
            <button className="w-fit rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90">Queue</button>
          </form>
          <p className="mt-3 text-xs text-white/60">
            Security note: the companion should always require local approval for any shell execution.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Recent jobs</h2>
          <ul className="mt-3 space-y-2">
            {jobs.length === 0 ? (
              <li className="text-sm text-white/60">No jobs yet.</li>
            ) : (
              jobs.map((j) => (
                <li key={j.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {j.kind} <span className="text-xs text-white/60">({j.status})</span>
                      </div>
                      <div className="mt-1 text-xs text-white/60">{j.createdAt.toISOString()}</div>
                      {j.resultText ? (
                        <pre className="mt-3 max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/80">
                          {j.resultText}
                        </pre>
                      ) : null}
                      {j.errorText ? (
                        <pre className="mt-3 max-h-64 overflow-auto rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
                          {j.errorText}
                        </pre>
                      ) : null}
                    </div>
                    {j.status === "QUEUED" ? (
                      <form action={cancelJob.bind(null, j.id)}>
                        <button className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10">
                          Cancel
                        </button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </main>
  );
}
