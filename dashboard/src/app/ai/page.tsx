import Link from "next/link";
import { prisma } from "@/lib/db";
import { cancelJob, queueJob } from "./actions";

export default async function AiPage() {
  const jobs = await prisma.agentJob.findMany({ orderBy: { createdAt: "desc" }, take: 25 });

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">AI / Agent Jobs</h1>
            <p className="text-xs text-neutral-500">Queue tasks for your (future) local companion + Codex hook.</p>
          </div>
          <Link className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50" href="/">
            Back
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-6">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold">Queue a job</h2>
          <form action={queueJob} className="mt-3 grid gap-2">
            <label className="text-xs font-medium text-neutral-600">Job type</label>
            <select name="kind" className="w-fit rounded-lg border px-3 py-2 text-sm">
              <option value="note">Note / task</option>
              <option value="shell">Shell (approved) command</option>
              <option value="combine_scan">Scan THE-COMBINE updates</option>
            </select>
            <textarea
              name="text"
              placeholder="Describe what you want the agent to do (later: this will be executed by a companion on your Mac or by a cloud agent)."
              className="min-h-28 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
            />
            <button className="w-fit rounded-lg bg-black px-3 py-2 text-sm font-medium text-white">Queue</button>
          </form>
          <p className="mt-3 text-xs text-neutral-500">
            Security note: the companion should always require local approval for any shell execution.
          </p>
        </div>

        <div className="mt-4 rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold">Recent jobs</h2>
          <ul className="mt-3 space-y-2">
            {jobs.length === 0 ? (
              <li className="text-sm text-neutral-500">No jobs yet.</li>
            ) : (
              jobs.map((j) => (
                <li key={j.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {j.kind} <span className="text-xs text-neutral-500">({j.status})</span>
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">{j.createdAt.toISOString()}</div>
                      {j.resultText ? (
                        <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-neutral-50 p-3 text-xs">
                          {j.resultText}
                        </pre>
                      ) : null}
                      {j.errorText ? (
                        <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-red-50 p-3 text-xs text-red-900">
                          {j.errorText}
                        </pre>
                      ) : null}
                    </div>
                    {j.status === "QUEUED" ? (
                      <form action={cancelJob.bind(null, j.id)}>
                        <button className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50">Cancel</button>
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
