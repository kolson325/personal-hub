import { prisma } from "@/lib/db";
import { queueRedeploy } from "./actions";
import { TopNav } from "@/app/_components/TopNav";

export const dynamic = "force-dynamic";

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
    <main className="min-h-screen">
      <TopNav title="Deploy / Restart" subtitle="Queue redeploy requests (VPS worker executes them)." />

      <section className="mx-auto max-w-4xl px-6 py-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Targets</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {targets.map((t) => (
              <form key={t.key} action={queueRedeploy.bind(null, t.key)}>
                <button className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left hover:bg-white/5">
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-white/60">Queue redeploy</div>
                </button>
              </form>
            ))}
          </div>
          <p className="mt-3 text-xs text-white/60">
            Once we deploy to a VPS, these will trigger{" "}
            <code className="rounded bg-white/10 px-1 py-0.5">docker compose up -d --build</code> via the worker.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Queued redeploy jobs</h2>
          <ul className="mt-3 space-y-2">
            {queued.length === 0 ? (
              <li className="text-sm text-white/60">No queued redeploy jobs.</li>
            ) : (
              queued.map((j) => (
                <li key={j.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{j.kind}</span>
                    <span className="text-xs text-white/60">{j.createdAt.toISOString()}</span>
                  </div>
                  <div className="mt-1 text-xs text-white/60">{j.payloadJson}</div>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </main>
  );
}
