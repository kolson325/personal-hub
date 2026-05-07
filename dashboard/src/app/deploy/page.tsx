import Link from "next/link";
import { prisma } from "@/lib/db";
import { queueRedeploy } from "./actions";

export default async function DeployPage() {
  const queued = await prisma.agentJob.findMany({
    where: { status: "QUEUED", kind: "redeploy" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const targets = [
    { key: "dashboard", label: "Dashboard" },
    { key: "centralhub", label: "Central Hub" },
    { key: "bizdev-agent", label: "BizDev Agent" },
    { key: "devops-agent", label: "DevOps Agent" },
    { key: "combine-monitor", label: "THE-COMBINE Monitor" },
  ];

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Deploy / Restart</h1>
            <p className="text-xs text-neutral-500">Queue redeploy requests (companion/VPS runner executes them).</p>
          </div>
          <Link className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50" href="/">
            Back
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-6">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold">Targets</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {targets.map((t) => (
              <form key={t.key} action={queueRedeploy.bind(null, t.key)}>
                <button className="w-full rounded-xl border bg-white px-4 py-3 text-left hover:bg-neutral-50">
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-neutral-500">Queue redeploy</div>
                </button>
              </form>
            ))}
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Once we deploy to a VPS, these will trigger{" "}
            <code className="rounded bg-neutral-100 px-1 py-0.5">docker compose pull/up -d</code> (or your chosen
            deploy flow) via a runner.
          </p>
        </div>

        <div className="mt-4 rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold">Queued redeploy jobs</h2>
          <ul className="mt-3 space-y-2">
            {queued.length === 0 ? (
              <li className="text-sm text-neutral-500">No queued redeploy jobs.</li>
            ) : (
              queued.map((j) => (
                <li key={j.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{j.kind}</span>
                    <span className="text-xs text-neutral-500">{j.createdAt.toISOString()}</span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">{j.payloadJson}</div>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </main>
  );
}
